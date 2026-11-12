import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  giftCreditAllows,
  giftMonthEnd,
  giftCreditReason,
} from '@/lib/domain/credits/gift-credit';
import { giftExpiration } from '@/lib/domain/credits/grant-gift-credit';
import { transferEntitlementAllowed } from '@/lib/domain/transfers/transfer-entitlement';
const now = new Date('2026-11-12T20:00:00Z');
const end = new Date('2026-12-01T05:00:00Z');
const base = {
  label: 'Gift',
  validFrom: now,
  validUntil: end,
  sourcePurchaseId: null,
  isUnlimited: false,
};
describe('named gift credit boundaries', () => {
  it.each(['CLASS', 'EVENT', 'BOTH'])(
    'enforces %s for both booking types',
    (kind) => {
      const a = { ...base, id: `gift-credit:${kind}:id` };
      for (const event of [false, true])
        expect(giftCreditAllows(a, now, now, event)).toBe(
          kind === 'BOTH' || (event ? kind === 'EVENT' : kind === 'CLASS'),
        );
      expect(giftCreditAllows(a, now, end, kind === 'EVENT')).toBe(false);
      expect(giftCreditAllows(a, end, now, kind === 'EVENT')).toBe(false);
      expect(
        giftCreditAllows({ ...a, validUntil: null }, now, now, false),
      ).toBe(false);
      expect(
        giftCreditAllows({ ...a, isUnlimited: true }, now, now, false),
      ).toBe(false);
      expect(
        giftCreditAllows({ ...a, sourcePurchaseId: 'paid' }, now, now, false),
      ).toBe(false);
    },
  );
  it('does not change existing non-gift accounts', () =>
    expect(giftCreditAllows({ ...base, id: 'old' }, now, end, true)).toBe(
      true,
    ));
  it('uses NJ month, including UTC month crossover', () => {
    expect(giftMonthEnd(new Date('2026-12-01T01:00:00Z'))).toBe('2026-11-30');
    expect(giftMonthEnd(new Date('2028-02-20T12:00:00Z'))).toBe('2028-02-29');
  });
  it.each([
    ['2026-03-08', '2026-03-09T04:00:00.000Z'],
    ['2026-11-01', '2026-11-02T05:00:00.000Z'],
    ['2026-11-30', '2026-12-01T05:00:00.000Z'],
  ])('expires after selected NJ day %s', (day, expected) =>
    expect(giftExpiration(day).toISOString()).toBe(expected),
  );
  it('rejects invalid calendar days', () =>
    expect(() => giftExpiration('2026-02-30')).toThrow());
  it('keeps custom reasons out of entitlement classification', () =>
    expect(
      giftCreditReason([
        {
          type: 'GRANT',
          reason: 'Gift credit grant: Birthday: vip complimentary',
        },
      ]),
    ).toBe('Birthday: vip complimentary'));
  it('requires original gift proof and preserves expiry on transfers', () => {
    const a = { ...base, id: 'gift-credit:BOTH:id' };
    const x = {
      accessType: 'STANDARD',
      creditAccountId: a.id,
      user: {
        role: 'MEMBER',
        status: 'ACTIVE',
        instructorProfile: null,
        memberships: [],
        creditAccounts: [a],
      },
      sourceIsEvent: false,
      destinationIsEvent: false,
      destinationStartsAt: now,
      now,
    };
    expect(transferEntitlementAllowed(x)).toBe(true);
    expect(transferEntitlementAllowed({ ...x, destinationStartsAt: end })).toBe(
      false,
    );
    expect(
      transferEntitlementAllowed({
        ...x,
        user: { ...x.user, creditAccounts: [] },
      }),
    ).toBe(false);
    expect(
      transferEntitlementAllowed({
        ...x,
        sourceIsEvent: true,
        destinationIsEvent: true,
      }),
    ).toBe(true);
  });
});
