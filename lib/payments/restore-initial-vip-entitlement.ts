import type { Prisma } from '@prisma/client';
import { grantVipEventCredit } from '@/lib/domain/credits/grant-vip-event-credit';
import { vipMonthlyBenefitWindowForDate } from '@/lib/domain/credits/vip-monthly-benefits';

// Proof must come from fresh server-side Stripe reads; never from request JSON.
export type PaidVipProof = {
  invoiceId: string; subscriptionId: string; customerId: string; purchaseId: string;
  paymentIntentId: string; priceId: string; amountCents: number; currency: string;
  paidAt: Date; periodStart: Date; periodEnd: Date;
};
export async function restoreInitialVipEntitlement(tx: Prisma.TransactionClient, input: {
  membershipId: string; actorId: string; reason: string; proof: PaidVipProof; now: Date; dryRun: boolean;
}) {
  const { proof, now } = input;
  if (!input.dryRun) {
    await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${proof.purchaseId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE id = ${input.membershipId} FOR UPDATE`;
  }
  const member = await tx.membership.findUnique({ where: { id: input.membershipId }, include: {
    product: true, user: true, purchase: { include: { creditAccount: true } },
  } });
  const payment = await tx.paymentRecord.findUnique({ where: { stripeInvoiceId: proof.invoiceId } });
  const purchase = member?.purchase;
  if (!member || !purchase || member.status !== 'ACTIVE' || member.user.status !== 'ACTIVE' ||
      member.planChangeState || member.billingLockToken || member.billingLockNeedsReview ||
      member.product.kind !== 'VIP' || !member.product.isUnlimited ||
      member.productId !== purchase.productId || member.product.stripePriceId !== proof.priceId ||
      member.purchaseId !== proof.purchaseId || member.stripeSubscriptionId !== proof.subscriptionId ||
      member.user.stripeCustomerId !== proof.customerId || purchase.status !== 'PAID' ||
      purchase.refundedAmountCents !== 0 || purchase.amountCents !== proof.amountCents ||
      purchase.currency.toLowerCase() !== proof.currency || !purchase.paidAt ||
      !payment || payment.status !== 'SUCCEEDED' || payment.refundedAmountCents !== 0 ||
      payment.userId !== member.userId || payment.purchaseId !== purchase.id || payment.membershipId !== member.id ||
      payment.stripePaymentIntentId !== proof.paymentIntentId || payment.amountCents !== proof.amountCents ||
      payment.currency.toLowerCase() !== proof.currency || proof.amountCents <= 0 ||
      ![proof.paidAt,proof.periodStart,proof.periodEnd,now].every(d => Number.isFinite(d.getTime())) ||
      proof.paidAt > now || proof.periodStart > now || proof.periodEnd <= now || proof.periodEnd <= proof.periodStart) {
    throw Error('Paid membership evidence does not match a recoverable initial VIP entitlement.');
  }
  const account = purchase.creditAccount;
  if (account?.isUnlimited && account.validFrom.getTime() === proof.periodStart.getTime() &&
      account.validUntil?.getTime() === proof.periodEnd.getTime() &&
      member.currentPeriodEnd?.getTime() === proof.periodEnd.getTime()) return { status: 'ALREADY_ACTIVE' as const };
  // Do not overwrite existing grants, renewal state or a staff-managed entitlement.
  if (account || member.currentPeriodEnd) throw Error('Existing entitlement requires separate review.');
  const acceptance = purchase.policyAcceptance;
  if (acceptance !== null && (typeof acceptance !== 'object' || Array.isArray(acceptance))) throw Error('Invalid purchase policy state.');
  const policy = acceptance ?? {};
  if ('nativeVipEntitlement' in policy) throw Error('Existing invoice entitlement requires separate review.');
  if (input.dryRun) return { status: 'READY' as const, periodEnd: proof.periodEnd };
  await tx.membership.update({ where: { id: member.id }, data: {
    currentPeriodStart: proof.periodStart, currentPeriodEnd: proof.periodEnd, activatedAt: member.activatedAt ?? proof.paidAt,
  } });
  await tx.purchase.update({ where: { id: purchase.id }, data: { policyAcceptance: {
    ...policy, nativeVipEntitlement: { paidEnd: proof.periodEnd.getTime()/1000, paidAt: proof.paidAt.getTime()/1000, invoiceId: proof.invoiceId },
  } } });
  await tx.creditAccount.create({ data: { userId: member.userId, sourcePurchaseId: purchase.id,
    label: member.product.name, isUnlimited: true, validFrom: proof.periodStart, validUntil: proof.periodEnd } });
  await grantVipEventCredit(tx, member.userId, vipMonthlyBenefitWindowForDate(now));
  await tx.auditLog.create({ data: { actorId: input.actorId, action: 'membership.paid-entitlement.restore',
    entityType: 'Membership', entityId: member.id,
    before: { missingCreditAccount: true, currentPeriodEnd: null },
    after: { invoiceId: proof.invoiceId, reason: input.reason, periodStart: proof.periodStart.toISOString(), periodEnd: proof.periodEnd.toISOString(), unlimited: true, eventCreditPolicy: 'calendar-month-deduplicated' },
  } });
  return { status: 'RESTORED' as const, periodEnd: proof.periodEnd };
}
