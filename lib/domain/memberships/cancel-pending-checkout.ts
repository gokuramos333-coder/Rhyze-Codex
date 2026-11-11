import type { Prisma, PrismaClient } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { expireAdminMembershipCheckoutSession, type PendingCheckoutBinding } from './admin-membership-checkout';

export const checkoutCancelledAudit = 'ADMIN_MEMBERSHIP_CHECKOUT_CANCELLED';
const intentAction = 'ADMIN_MEMBERSHIP_CHECKOUT_CANCEL_REQUESTED';
type Input = { userId: string; purchaseId: string; actorId: string; reason: string; live: boolean };

async function lockedPurchase(tx: Prisma.TransactionClient, input: Input) {
  // Match recurring checkout fulfillment's Purchase -> User order, not the inverse.
  await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${input.purchaseId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId} FOR UPDATE`;
  const purchase = await tx.purchase.findUnique({ where: { id: input.purchaseId }, include: {
    user: true, product: true, membership: true, invoice: true, paymentRecords: true, creditAccount: true,
  } });
  const policy = purchase?.policyAcceptance as { source?: string } | null;
  if (!purchase || purchase.userId !== input.userId || policy?.source !== 'ADMIN_CHECKOUT' ||
      !['MONTHLY_UNLIMITED', 'LIMITED_MEMBERSHIP', 'VIP'].includes(purchase.product.kind) ||
      purchase.product.billingInterval === 'ONE_TIME' || !purchase.stripeCheckoutSessionId ||
      purchase.paidAt || purchase.stripePaymentIntentId || purchase.refundedAmountCents ||
      purchase.membership || purchase.invoice || purchase.paymentRecords.length || purchase.creditAccount) {
    throw Error('Only this client’s unfinished admin membership checkout can be cancelled.');
  }
  // Legacy/unlinked receipts can identify a payment by session alone. Inspect
  // them under the same purchase lock used by fulfillment, not just the FK.
  const sessionPayments = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "PaymentRecord" WHERE "stripeCheckoutSessionId" = ${purchase.stripeCheckoutSessionId} FOR UPDATE`;
  if (sessionPayments.length) throw Error('Payment evidence exists for this checkout. Staff review required.');
  const receipt = await tx.auditLog.findFirst({ where: { entityType: 'Purchase', entityId: purchase.id, action: checkoutCancelledAudit } });
  if (purchase.status !== 'PENDING' && !(purchase.status === 'FAILED' && receipt)) {
    throw Error('This purchase is no longer a pending checkout.');
  }
  const binding: PendingCheckoutBinding = { purchaseId: purchase.id, userId: purchase.userId, productId: purchase.productId,
    sessionId: purchase.stripeCheckoutSessionId, customerId: purchase.user.stripeCustomerId, live: input.live,
    ...(purchase.user.stripeCustomerId === null ? { customerEmail: purchase.user.email } : {}) };
  if (receipt && !isDeepStrictEqual((receipt.after as { binding?: unknown } | null)?.binding, binding)) {
    throw Error('Cancellation receipt no longer matches the saved checkout.');
  }
  return { purchase, binding, receipt };
}

/** No customer communication, replacement, credit change or subscription mutation. */
export async function cancelPendingMembershipCheckout(
  input: Input,
  db: PrismaClient,
  provider: Parameters<typeof expireAdminMembershipCheckoutSession>[1],
) {
  const initial = await db.$transaction(async tx => {
    const state = await lockedPurchase(tx, input);
    if (!state.receipt) {
      const intent = await tx.auditLog.findFirst({ where: { action: intentAction, entityType: 'Purchase', entityId: input.purchaseId } });
      if (!intent) await tx.auditLog.create({ data: { actorId: input.actorId, action: intentAction, entityType: 'Purchase', entityId: input.purchaseId,
        after: { binding: state.binding, reason: input.reason } } });
    }
    return state;
  });
  // Durable intent survives provider uncertainty. The pending row remains blocked
  // until independent expired/unpaid proof AND a fresh locked database check.
  const proof = await expireAdminMembershipCheckoutSession(initial.binding, provider);
  await db.$transaction(async tx => {
    const current = await lockedPurchase(tx, input);
    if (!isDeepStrictEqual(current.binding, initial.binding) ||
        current.purchase.amountCents !== initial.purchase.amountCents ||
        !isDeepStrictEqual(current.purchase.policyAcceptance, initial.purchase.policyAcceptance)) {
      throw Error('Saved checkout changed during cancellation. Review before retrying.');
    }
    if (current.receipt) return;
    const changed = await tx.purchase.updateMany({ where: { id: input.purchaseId, userId: input.userId, status: 'PENDING',
      stripeCheckoutSessionId: initial.binding.sessionId, paidAt: null, stripePaymentIntentId: null },
      data: { status: 'FAILED', failedAt: new Date() } });
    if (changed.count !== 1) throw Error('Checkout changed during cancellation.');
    await tx.auditLog.create({ data: { actorId: input.actorId, action: checkoutCancelledAudit, entityType: 'Purchase', entityId: input.purchaseId,
      before: { status: 'PENDING' }, after: { status: 'FAILED', binding: current.binding, reason: input.reason, proof } } });
  });
}
