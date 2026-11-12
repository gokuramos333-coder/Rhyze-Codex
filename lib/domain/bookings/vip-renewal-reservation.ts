import { vipEntitlementInclude, vipMembershipPaidThrough, type VipEntitlementMembership } from '@/lib/domain/credits/vip-access';
import { isAdminAssignment } from '@/lib/domain/credits/manual-assignment-access';

// Opt-in only at the member booking action; the existing credit/event gate stays strict.
export const vipRenewalEntitlementInclude = {
  ...vipEntitlementInclude,
  freezes: true,
  changeRequests: { where: { status: 'PENDING' as const } },
  planChanges: { where: { activeMembershipId: { not: null } } },
} as const;
export type RenewalMembership = VipEntitlementMembership & {
  stripeSubscriptionId?: string | null;
  cancelAtPeriodEnd?: boolean;
  billingLockToken?: string | null;
  billingLockNeedsReview?: boolean;
  product: VipEntitlementMembership['product'] & { priceCents?: number; billingInterval?: string };
  freezes?: { startAt: Date; endAt: Date; cancelledAt: Date | null }[];
  changeRequests?: { status: string; type: string }[];
  planChanges?: { activeMembershipId: string | null }[];
};
export type VipRenewalFunding = { version: 1; membershipId: string; creditAccountId: string; paidThroughAtBooking: string };
export function renewalFunding(snapshot: unknown): VipRenewalFunding | null {
  const value = (snapshot as { vipRenewalReservation?: VipRenewalFunding } | null)?.vipRenewalReservation;
  return value?.version === 1 && typeof value.membershipId === 'string' && typeof value.creditAccountId === 'string' &&
    Number.isFinite(Date.parse(value.paidThroughAtBooking)) ? value : null;
}
// Compare studio wall-clock dates so a seven-day window remains seven New Jersey
// calendar days across daylight-saving changes. The upper boundary is exclusive.
function easternWallTime(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: string) => Number(parts.find(p => p.type === type)?.value);
  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'), value.getUTCMilliseconds());
}
export function vipRenewalReservation(input: {
  account: { id?: string; isUnlimited: boolean; sourcePurchase?: { membership?: { id: string } | null } | null };
  memberships: RenewalMembership[]; now: Date; occurrenceStartsAt: Date; isEvent: boolean;
}): VipRenewalFunding | null {
  if (input.isEvent || !input.account.isUnlimited || !input.account.id) return null;
  const m = input.memberships.find(m => m.id === input.account.sourcePurchase?.membership?.id);
  if (!m || m.status !== 'ACTIVE' || m.product.kind !== 'VIP' || !m.purchaseId || !m.stripeSubscriptionId ||
    m.cancelAtPeriodEnd !== false || m.billingLockToken || m.billingLockNeedsReview ||
    !['MONTHLY', 'YEARLY'].includes(m.product.billingInterval ?? '') || !(m.product.priceCents! > 0) ||
    m.purchase?.status !== 'PAID' || isAdminAssignment(m.purchase.policyAcceptance) ||
    m.purchase.creditAccount?.id !== input.account.id ||
    !m.freezes || !m.changeRequests || !m.planChanges ||
    m.changeRequests.some(r => r.status === 'PENDING') || m.planChanges.some(p => p.activeMembershipId) ||
    m.freezes.some(f => !f.cancelledAt && f.startAt <= input.occurrenceStartsAt && f.endAt > input.now)) return null;
  const paidEnd = vipMembershipPaidThrough(m, input.now);
  if (!paidEnd || !m.currentPeriodEnd || paidEnd.getTime() !== m.currentPeriodEnd.getTime() ||
    input.occurrenceStartsAt < paidEnd || easternWallTime(input.occurrenceStartsAt) >= easternWallTime(paidEnd) + 7 * 86400000) return null;
  return { version: 1, membershipId: m.id, creditAccountId: input.account.id, paidThroughAtBooking: paidEnd.toISOString() };
}
