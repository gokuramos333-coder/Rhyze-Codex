import { describe, expect, it } from 'vitest';
import { vipRenewalReservation } from '@/lib/domain/bookings/vip-renewal-reservation';
const now = new Date('2026-11-03T20:00Z');
const end = new Date('2026-11-06T22:09:25Z');
function fixture() {
  const membership = { id: 'm', userId: 'u', productId: 'vip', purchaseId: 'p', status: 'ACTIVE', currentPeriodEnd: end,
    stripeSubscriptionId: 'sub_test', cancelAtPeriodEnd: false, freezes: [] as any[], changeRequests: [] as any[], planChanges: [] as any[],
    product: { kind: 'VIP', billingInterval: 'MONTHLY', priceCents: 19900 },
    purchase: { status: 'PAID', paidAt: new Date('2026-10-06T22:09:25Z'), creditAccount: { id: 'a', isUnlimited: true, validFrom: new Date('2026-10-06T22:09:25Z'), validUntil: end } } };
  const account = { id: 'a', isUnlimited: true, label: 'VIP', validFrom: membership.purchase.creditAccount.validFrom, validUntil: end, sourcePurchase: { product: membership.product, membership: { id: 'm' } } };
  return { account, memberships: [membership], now, occurrenceStartsAt: new Date('2026-11-07T16:00Z'), isEvent: false };
}
describe('narrow paid VIP seven-day renewal reservation', () => {
  function priceChange() {
    return { activeMembershipId: 'm', status: 'SCHEDULED', timing: 'NEXT_RENEWAL',
      fromProductId: 'vip', toProductId: 'vip', stripeSubscriptionId: 'sub_test',
      stripeScheduleId: 'sched_test', effectiveAt: end, periodEnd: end,
      quote: { resetBillingCycle: false, monthlyCents: 17760 } };
  }
  it('keeps continuing VIP booking open during a scheduled price-only change', () => {
    const f = fixture(); f.memberships[0].planChanges.push(priceChange());
    expect(vipRenewalReservation(f)?.membershipId).toBe('m');
    f.isEvent = true; expect(vipRenewalReservation(f)).toBeNull();
    f.isEvent = false; f.occurrenceStartsAt = new Date('2026-11-13T22:09:25Z');
    expect(vipRenewalReservation(f)).toBeNull();
  });
  it.each([
    { status: 'SUBMITTING' }, { status: 'AWAITING_PAYMENT' }, { timing: 'NOW' },
    { toProductId: 'limited' }, { fromProductId: 'other' }, { activeMembershipId: 'other' },
    { stripeSubscriptionId: 'other' }, { stripeScheduleId: null },
    { effectiveAt: new Date(+end + 86400000) }, { periodEnd: new Date(+end - 86400000) },
    { quote: { resetBillingCycle: true, monthlyCents: 17760 } },
    { quote: { resetBillingCycle: false, monthlyCents: 0 } }, { quote: null },
  ])('fails closed for an unverified or access-changing operation %j', change => {
    const f = fixture(); f.memberships[0].planChanges.push({ ...priceChange(), ...change });
    expect(vipRenewalReservation(f)).toBeNull();
  });
  it('still honors cancellation, billing review and freeze with a price-only change', () => {
    const f = fixture(); const m = f.memberships[0]; m.planChanges.push(priceChange());
    m.cancelAtPeriodEnd = true; expect(vipRenewalReservation(f)).toBeNull(); m.cancelAtPeriodEnd = false;
    m.changeRequests.push({ status: 'PENDING', type: 'CANCEL' }); expect(vipRenewalReservation(f)).toBeNull(); m.changeRequests = [];
    Object.assign(m, { billingLockNeedsReview: true }); expect(vipRenewalReservation(f)).toBeNull();
    Object.assign(m, { billingLockNeedsReview: false });
    m.freezes.push({ startAt: end, endAt: new Date(+end + 86400000), cancelledAt: null });
    expect(vipRenewalReservation(f)).toBeNull();
  });
  it.each(['2026-11-06T22:09:25Z','2026-11-07T16:00Z','2026-11-09T16:00Z','2026-11-13T22:09:24.999Z'])('admits %s', date => {
    const f = fixture(); f.occurrenceStartsAt = new Date(date);
    expect(vipRenewalReservation(f)?.membershipId).toBe('m');
  });
  it.each(['2026-11-06T22:09:24Z','2026-11-13T22:09:25Z','2026-12-06T17:00Z'])('does not tag paid-term or beyond seven days %s', date => {
    const f = fixture(); f.occurrenceStartsAt = new Date(date); expect(vipRenewalReservation(f)).toBeNull();
  });
  it.each(['PAST_DUE','PAUSED','CANCELLED','EXPIRED','TRIALING'])('rejects %s', status => {
    const f = fixture(); f.memberships[0].status = status; expect(vipRenewalReservation(f)).toBeNull();
  });
  it.each(['event','finite','no-subscription','cancel','unpaid','expired','wrong-account','limited','monthly','gift','freeze','cancel-request','plan-change','reversed','billing-review'])('rejects %s', reason => {
    const f = fixture(); const m = f.memberships[0];
    if (reason === 'event') f.isEvent = true;
    if (reason === 'finite') f.account.isUnlimited = false;
    if (reason === 'no-subscription') m.stripeSubscriptionId = '';
    if (reason === 'cancel') m.cancelAtPeriodEnd = true;
    if (reason === 'unpaid') m.purchase.status = 'FAILED';
    if (reason === 'expired') f.now = end;
    if (reason === 'wrong-account') f.account.id = 'other';
    if (reason === 'limited') m.product.kind = 'LIMITED_MEMBERSHIP';
    if (reason === 'monthly') m.product.kind = 'MONTHLY_UNLIMITED';
    if (reason === 'gift') m.product.priceCents = 0;
    if (reason === 'freeze') m.freezes.push({ startAt: end, endAt: new Date('2026-11-10T05:00Z'), cancelledAt: null });
    if (reason === 'cancel-request') m.changeRequests.push({ type: 'CANCEL', status: 'PENDING' });
    if (reason === 'plan-change') m.planChanges.push({ activeMembershipId: 'm' });
    if (reason === 'reversed') Object.assign(m, { planChangeState: { fundingReversedAt: 123 } });
    if (reason === 'billing-review') Object.assign(m, { billingLockNeedsReview: true });
    expect(vipRenewalReservation(f)).toBeNull();
  });
  it.each([
    ['2026-10-31T16:00Z', '2026-11-07T16:59:59.999Z', '2026-11-07T17:00Z'],
    ['2027-03-13T17:00Z', '2027-03-20T15:59:59.999Z', '2027-03-20T16:00Z'],
  ])('uses seven New Jersey calendar days across DST from %s', (paidEnd, lastAllowed, firstDenied) => {
    const f = fixture(); const cutoff = new Date(paidEnd);
    f.now = new Date(+cutoff - 86400000);
    f.memberships[0].purchase.paidAt = f.memberships[0].purchase.creditAccount.validFrom = f.account.validFrom = new Date(+cutoff - 20 * 86400000);
    f.memberships[0].currentPeriodEnd = f.memberships[0].purchase.creditAccount.validUntil = f.account.validUntil = cutoff;
    f.occurrenceStartsAt = new Date(lastAllowed); expect(vipRenewalReservation(f)).not.toBeNull();
    f.occurrenceStartsAt = new Date(firstDenied); expect(vipRenewalReservation(f)).toBeNull();
  });
  it('allows a withdrawn cancellation request but never an active cancellation notice', () => {
    const f = fixture(); f.memberships[0].changeRequests.push({type:'CANCEL',status:'DENIED'});
    expect(vipRenewalReservation(f)).not.toBeNull();
    f.memberships[0].changeRequests[0].status = 'PENDING'; expect(vipRenewalReservation(f)).toBeNull();
  });
});
