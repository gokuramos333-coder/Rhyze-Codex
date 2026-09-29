import { describe, expect, it } from 'vitest';
import { vipCreditAccountCanBook, vipMembershipPaidThrough } from '@/lib/domain/credits/vip-access';

const now = new Date('2026-09-21T16:00:00Z');
const end = new Date('2026-10-03T16:00:00Z');
function membership() {
  return {
    id: 'membership', userId: 'member', purchaseId: 'purchase', status: 'ACTIVE',
    currentPeriodEnd: end, product: { kind: 'VIP' },
    purchase: { status: 'PAID', paidAt: new Date('2026-09-03T16:00:00Z'),
      creditAccount: { isUnlimited: true, validFrom: new Date('2026-09-03T16:00:00Z'), validUntil: end } },
  };
}
const monthly = { id: 'monthly', label: 'VIP membership — unlimited standard class credits — September 2026', isUnlimited: true };
describe('paid VIP entitlement, independent of background jobs', () => {
  it('bounds a corrected class-only manual assignment by the selected class date', () => {
    const start = new Date('2026-09-29T17:09:05Z');
    const giftEnd = new Date('2027-02-02T04:59:59.999Z');
    const account = { label: 'Complimentary regular classes', validFrom: start, validUntil: giftEnd,
      sourcePurchase: { policyAcceptance: { source: 'ADMIN_ASSIGNMENT', accessEndsAt: giftEnd.toISOString() },
        product: { kind: 'VIP' }, membership: { id: 'manual', product: { kind: 'MONTHLY_UNLIMITED' } } } };
    const input = { account, memberships: [], now: start };
    expect(vipCreditAccountCanBook({ ...input, occurrenceStartsAt: new Date('2027-02-01T17:00Z') })).toBe(true);
    expect(vipCreditAccountCanBook({ ...input, occurrenceStartsAt: giftEnd })).toBe(false);
    expect(vipCreditAccountCanBook({ ...input, occurrenceStartsAt: new Date(start.getTime() - 1) })).toBe(false);
    expect(vipCreditAccountCanBook({ ...input, now: giftEnd })).toBe(false);
  });
  it('allows an actually paid current VIP window', () => {
    expect(vipMembershipPaidThrough(membership(), now)).toEqual(end);
    expect(vipCreditAccountCanBook({ account: monthly, memberships: [membership()], now })).toBe(true);
  });
  it('ends at the exact paid-through time even if status remains ACTIVE', () => {
    expect(vipCreditAccountCanBook({ account: monthly, memberships: [membership()], now: end })).toBe(false);
  });
  it('does not treat a new unpaid subscription period as payment', () => {
    const m = membership();
    m.currentPeriodEnd = new Date('2026-11-03T16:00:00Z');
    expect(vipMembershipPaidThrough(m, end)).toBeNull();
  });
  it.each(['PAST_DUE', 'UNPAID', 'CANCELLED', 'PAUSED', 'EXPIRED'])('blocks %s immediately', status => {
    expect(vipMembershipPaidThrough({ ...membership(), status }, now)).toBeNull();
  });
  it('fails closed for missing purchase, missing expiry, refunded or unpaid purchases', () => {
    const m = membership();
    expect(vipMembershipPaidThrough({ ...m, purchase: null }, now)).toBeNull();
    expect(vipMembershipPaidThrough({ ...m, currentPeriodEnd: null }, now)).toBeNull();
    for (const status of ['PENDING', 'FAILED', 'REFUNDED']) {
      expect(vipMembershipPaidThrough({ ...m, purchase: { ...m.purchase, status } }, now)).toBeNull();
    }
  });
  it('does not authorize classes beyond the paid window', () => {
    expect(vipCreditAccountCanBook({ account: monthly, memberships: [membership()], now, occurrenceStartsAt: end })).toBe(false);
  });
  it('uses a separately paid managed invoice, not a refunded historical receipt', () => {
    const m = membership();
    const managed = { ...m, purchase: { ...m.purchase, status: 'REFUNDED' }, planChangeState: {
      paidAt: Math.floor(now.getTime() / 1000), paidEnd: Math.floor(end.getTime() / 1000), lastInvoiceId: 'in_current_paid',
    } };
    expect(vipMembershipPaidThrough(managed, now)).toEqual(end);
    expect(vipMembershipPaidThrough({ ...managed, status: 'PAST_DUE' }, now)).toBeNull();
    expect(vipMembershipPaidThrough({ ...managed, purchase: m.purchase, planChangeState: { ...managed.planChangeState, fundingReversedAt: 1 } }, now)).toBeNull();
    expect(vipMembershipPaidThrough({ ...managed, planChangeState: { ...managed.planChangeState, lastInvoiceId: null } }, now)).toBeNull();
  });
  it('also gates old unlinked VIP event credits', () => {
    expect(vipCreditAccountCanBook({ account: { ...monthly, label: 'Event credit — September 2026 VIP complimentary event credit' }, memberships: [], now })).toBe(false);
  });
  it('preserves manual non-VIP credits and explicit complimentary accounts', () => {
    expect(vipCreditAccountCanBook({ account: { ...monthly, label: 'Complimentary regular classes' }, memberships: [], now })).toBe(true);
  });
  it('checks linked VIP accounts against their own membership, not another plan', () => {
    const expired = { ...membership(), id: 'expired', currentPeriodEnd: now };
    const account = { ...monthly, sourcePurchase: { product: { kind: 'VIP' }, membership: expired } };
    expect(vipCreditAccountCanBook({ account, memberships: [membership(), expired], now })).toBe(false);
  });
  it.each([
    ['cmryg3hyn000uw9wrjgudtj7l', 'cms446vbs006fl709vf1ay2ev'],
    ['cmryg3hy70000w9wrszwya76i', 'cms446vb4006bl709io10m50p'],
  ])('preserves only the approved September recovery exception for %s', (userId, id) => {
    const m = { ...membership(), userId, id, purchaseId: null, purchase: null, currentPeriodEnd: new Date('2026-09-03T04:00:00Z') };
    expect(vipCreditAccountCanBook({ account: monthly, memberships: [m], now })).toBe(true);
    expect(vipCreditAccountCanBook({ account: monthly, memberships: [m], now: new Date('2026-10-01T04:00:00Z') })).toBe(false);
    expect(vipCreditAccountCanBook({ account: monthly, memberships: [{ ...m, id: 'different' }], now })).toBe(false);
  });
});
