import { describe, expect, it } from 'vitest';
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
      { stripeSubscriptionId: 'sub_paid' },
      { currentPeriodEnd: now },
      { activatedAt: new Date('2026-10-01') },
      { product: { ...trial.product, trialDays: 14 } },
      { product: { ...trial.product, kind: 'VIP' } },
    ]) {
      expect(canCancelIntroTrial({ ...trial, ...patch }, now)).toBe(false);
    }
  });
  it('allows a paused unexpired trial and requires exact booking funding', () => {
    expect(canCancelIntroTrial({ ...trial, status: 'PAUSED' }, now)).toBe(true);
    expect(
      trialBookingScope(
        { accessType: 'INTRO_TRIAL', creditAccountId: 'trial-credit' },
        'trial-credit',
        2,
      ),
    ).toBe('cancel');
    expect(
      trialBookingScope({ accessType: 'INTRO_TRIAL' }, 'trial-credit', 1),
    ).toBe('review');
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
