import { describe, expect, it } from 'vitest';
import {
  trialUpgradeTerms,
  requireTrialUpgradeCheckout,
} from '@/lib/domain/memberships/trial-upgrade';
import {
  canCancelIntroTrial,
  trialBookingScope,
} from '@/lib/domain/memberships/intro-trial-cancellation-policy';

const now = new Date('2026-11-08T16:00Z');
const trial = {
  status: 'TRIALING',
  stripeSubscriptionId: null,
  activatedAt: new Date('2026-11-07T16:00Z'),
  currentPeriodEnd: new Date('2026-11-14T16:00Z'),
  product: { kind: 'INTRO_TRIAL', trialDays: 7, billingInterval: 'ONE_TIME' },
};
describe('trial cancellation eligibility and provenance', () => {
  it('accepts only a current seven-day one-time trial, including not-yet-booked access', () => {
    expect(canCancelIntroTrial(trial, now)).toBe(true);
    expect(
      canCancelIntroTrial(
        { ...trial, activatedAt: null, currentPeriodEnd: null },
        now,
      ),
    ).toBe(true);
    for (const patch of [
      { status: 'CANCELLED' },
      { status: 'PAUSED' },
      { stripeSubscriptionId: 'sub_paid' },
      { currentPeriodEnd: now },
      { activatedAt: new Date('2026-10-01') },
      { product: { ...trial.product, trialDays: 14 } },
      { product: { ...trial.product, kind: 'VIP' } },
    ]) {
      expect(canCancelIntroTrial({ ...trial, ...patch }, now)).toBe(false);
    }
  });
  it('requires exact account provenance or a single historical trial for legacy unlinked bookings', () => {
    expect(
      trialBookingScope(
        { accessType: 'INTRO_TRIAL', creditAccountId: 'trial-credit' },
        'trial-credit',
        2,
      ),
    ).toBe('cancel');
    expect(
      trialBookingScope({ accessType: 'INTRO_TRIAL' }, 'trial-credit', 1),
    ).toBe('cancel');
    expect(
      trialBookingScope({ accessType: 'INTRO_TRIAL' }, 'trial-credit', 2),
    ).toBe('review');
    expect(trialBookingScope(null, 'trial-credit', 1)).toBe('review');
    expect(
      trialBookingScope(
        { accessType: 'STANDARD', creditAccountId: 'paid-credit' },
        'trial-credit',
        1,
      ),
    ).toBe('preserve');
    expect(
      trialBookingScope(
        { accessType: 'INTRO_TRIAL', creditAccountId: 'other-trial' },
        'trial-credit',
        2,
      ),
    ).toBe('preserve');
    expect(
      trialBookingScope(
        { accessType: 'VIP', creditAccountId: 'trial-credit' },
        'trial-credit',
        1,
      ),
    ).toBe('review');
  });
});
describe('first period offer terms', () => {
  it('uses an exact $78 first payment, then the unchanged $92 renewal', () => {
    expect(trialUpgradeTerms({ mode: 'amount', value: '78' }, 9200)).toEqual({
      firstCents: 7800,
      recurringCents: 9200,
      amountOffCents: 1400,
      duration: 'once',
    });
  });
  it('keeps explicit 15% distinct from the rounded flat amount', () => {
    expect(
      trialUpgradeTerms({ mode: 'percent', value: '15' }, 9200),
    ).toMatchObject({
      firstCents: 7820,
      recurringCents: 9200,
      amountOffCents: 1380,
      duration: 'once',
    });
  });
  it.each(['', '-1', '0', '93', '78.001', 'Infinity', '1e2'])(
    'rejects invalid flat amount %s',
    (value) => {
      expect(() =>
        trialUpgradeTerms({ mode: 'amount', value }, 9200),
      ).toThrow();
    },
  );
  it.each(['100', '-1', '15.001', ''])(
    'rejects invalid percentage %s',
    (value) => {
      expect(() =>
        trialUpgradeTerms({ mode: 'percent', value }, 9200),
      ).toThrow();
    },
  );
  it('fails closed before a checkout or checkout email can be created', () => {
    expect(() => requireTrialUpgradeCheckout()).toThrow(
      /unavailable.*activation.*renewal/i,
    );
  });
});
