import { recoveryForUser } from '@/lib/domain/memberships/somble-billing-recovery';
import { currentCreditProduct } from '@/lib/domain/credits/current-credit-product';

export const vipEntitlementInclude = {
  product: true,
  purchase: { include: { creditAccount: true } },
} as const;

export type VipEntitlementMembership = {
  id: string;
  userId: string;
  purchaseId: string | null;
  status: string;
  currentPeriodEnd: Date | null;
  planChangeState?: unknown;
  product: { kind: string; slug?: string; customPlanType?: string | null };
  purchase?: {
    status: string;
    paidAt: Date | null;
    creditAccount: { isUnlimited: boolean; validFrom: Date; validUntil: Date | null } | null;
  } | null;
};

export function vipCreditBenefit(account: { id?: string; label: string; sourcePurchase?: { product: { kind: string }; membership?: { product?: { kind: string } } | null } | null }) {
  return account.id === 'rhyze-erika-gifted-vip-credit-2026' || currentCreditProduct(account)?.kind === 'VIP' || (!account.sourcePurchase && (
    account.label.startsWith('VIP membership — unlimited standard class credits') ||
    account.label.toLowerCase().includes('vip complimentary event credit')
  ));
}

// An explicit, existing migration-owned gift, never a general zero-price VIP exception.
export function giftedVipThrough(membership: VipEntitlementMembership, now: Date): Date | null {
  if (membership.id !== 'rhyze-erika-gifted-vip-membership-2026' ||
      membership.product.slug !== 'erika-rivera-gifted-vip' || membership.product.kind !== 'VIP' ||
      membership.purchaseId || membership.status !== 'ACTIVE' || !membership.currentPeriodEnd ||
      now < new Date('2026-08-03T23:15:00Z')) return null;
  const end = new Date(Math.min(membership.currentPeriodEnd.getTime(), new Date('2027-02-02T04:59:59.999Z').getTime()));
  return now < end ? end : null;
}

// A subscription's ACTIVE label / next invoice period is not proof of payment.
// Only invoice-paid processing extends the purchase-linked credit window.
export function vipMembershipPaidThrough(membership: VipEntitlementMembership, now: Date): Date | null {
  if (membership.product.kind !== 'VIP' || !['ACTIVE', 'TRIALING'].includes(membership.status)) return null;
  const recovery = recoveryForUser(membership.userId);
  if (recovery?.kind === 'VIP' && membership.id === recovery.membershipId && !membership.purchaseId) {
    const exceptionEnd = new Date('2026-10-01T04:00:00Z');
    return now < exceptionEnd ? exceptionEnd : null;
  }
  const purchase = membership.purchase;
  const account = purchase?.creditAccount;
  const managed = membership.planChangeState as { lastInvoiceId?: string; paidAt?: number; paidEnd?: number; fundingReversedAt?: number } | null;
  if (managed?.fundingReversedAt) return null;
  const independentlyPaid = Boolean(managed?.lastInvoiceId && !managed.fundingReversedAt && managed.paidAt && managed.paidAt <= now.getTime() / 1000 && managed.paidEnd && managed.paidEnd >= (membership.currentPeriodEnd?.getTime() || Infinity) / 1000);
  if ((!independentlyPaid && (!purchase?.paidAt || !['PAID', 'PARTIALLY_REFUNDED'].includes(purchase.status))) ||
      !account?.isUnlimited || account.validFrom > now || !account.validUntil || !membership.currentPeriodEnd) return null;
  const end = new Date(Math.min(account.validUntil.getTime(), membership.currentPeriodEnd.getTime()));
  return end > now ? end : null;
}

export function vipCreditAccountCanBook(input: {
  account: {
    id?: string;
    label: string;
    sourcePurchase?: { product: { kind: string }; membership?: { id: string; product?: { kind: string } } | null } | null;
  };
  memberships: VipEntitlementMembership[];
  now: Date;
  occurrenceStartsAt?: Date;
}) {
  const source = input.account.sourcePurchase;
  const linkedVip = currentCreditProduct(input.account)?.kind === 'VIP';
  const legacyVipBenefit = vipCreditBenefit(input.account);
  if (!linkedVip && !legacyVipBenefit) return true;
  return input.memberships.some(membership => {
    if (linkedVip && membership.id !== source?.membership?.id) return false;
    const end = input.account.id === 'rhyze-erika-gifted-vip-credit-2026'
      ? giftedVipThrough(membership, input.now) : vipMembershipPaidThrough(membership, input.now);
    return Boolean(end && (!input.occurrenceStartsAt || input.occurrenceStartsAt < end));
  });
}
