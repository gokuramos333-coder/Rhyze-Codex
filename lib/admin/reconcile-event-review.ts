import { Prisma, type PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { isApprovedOwner } from '@/lib/auth/owner-access';
import { z } from 'zod';
import { lockOccurrenceWrites, lockOrderWrites, lockBookingWrites } from '@/lib/domain/bookings/write-fence';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';

export const eventReviewSchema = z.object({
  orderId: z.string().min(1), bookingId: z.string().min(1),
  orderUpdatedAt: z.string().datetime(), bookingUpdatedAt: z.string().datetime(),
  reason: z.string().trim().min(10).max(500),
  confirmation: z.literal('RECONCILE'), dryRun: z.boolean().default(true),
}).strict();
type Input = z.infer<typeof eventReviewSchema> & { actorId: string };
const action = 'commerce-order.fulfillment-review-reconciled';
export class EventReviewError extends Error {}
function reject(): never { throw new EventReviewError('Payment or booking proof changed or is incomplete. Review the exact order before retrying.'); }
function id(value: string | { id: string } | null) { return typeof value === 'string' ? value : value?.id ?? null; }
const include = { occurrence: { include: { template: true } }, paymentRecords: true, refunds: true } as const;

/** Owner-authenticated status correction only. Never invokes fulfillment or financial mutations. */
export async function reconcileEventReview(db: PrismaClient, stripe: Stripe, input: Input) {
  const initial = await db.commerceOrder.findUnique({ where: { id: input.orderId }, include });
  if (!initial?.stripePaymentIntentId || !initial.stripeCheckoutSessionId || !initial.userId || !initial.occurrenceId) reject();
  const [account, intent, session] = await Promise.all([
    stripe.accounts.retrieve(), stripe.paymentIntents.retrieve(initial.stripePaymentIntentId),
    stripe.checkout.sessions.retrieve(initial.stripeCheckoutSessionId),
  ]);
  if (account.id !== 'acct_1Tu0UqRIYui0I7dP' || !intent.livemode || intent.id !== initial.stripePaymentIntentId ||
      intent.status !== 'succeeded' || intent.amount !== initial.amountCents || intent.amount_received !== initial.amountCents ||
      intent.currency !== initial.currency || !session.livemode || session.id !== initial.stripeCheckoutSessionId ||
      session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid' ||
      id(session.payment_intent) !== intent.id || session.amount_total !== initial.amountCents || session.currency !== initial.currency ||
      session.metadata?.commerceOrderId !== initial.id || session.metadata?.userId !== initial.userId ||
      session.metadata?.occurrenceId !== initial.occurrenceId) reject();
  const chargeId = id(intent.latest_charge); if (!chargeId) reject();
  const [charge, refunds, disputes] = await Promise.all([
    stripe.charges.retrieve(chargeId), stripe.refunds.list({ payment_intent: intent.id, limit: 100 }),
    stripe.disputes.list({ charge: chargeId, limit: 1 }),
  ]);
  if (charge.id !== chargeId || !charge.livemode || !charge.paid || !charge.captured || charge.status !== 'succeeded' ||
      id(charge.payment_intent) !== intent.id || id(charge.customer) !== id(intent.customer) || id(session.customer) !== id(intent.customer) ||
      charge.amount !== initial.amountCents || charge.amount_captured !== initial.amountCents || charge.currency !== initial.currency ||
      charge.refunded || charge.disputed || charge.amount_refunded !== 0 || refunds.has_more || refunds.data.length ||
      disputes.has_more || disputes.data.length) reject();
  const verifiedAt = new Date();
  return retrySerializableTransaction(() => db.$transaction(async tx => {
    if (input.dryRun) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    else {
      await lockOccurrenceWrites(tx, initial.occurrenceId!);
      await lockOrderWrites(tx, initial.id);
      await lockBookingWrites(tx, input.bookingId);
    }
    const owner = await tx.user.findUnique({ where: { id: input.actorId }, select: { email: true, role: true, status: true } });
    if (!owner || !isApprovedOwner(owner)) reject();
    const order = await tx.commerceOrder.findUnique({ where: { id: initial.id }, include });
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId }, include: { attendance: true } });
    const prior = await tx.auditLog.findFirst({ where: { action, entityType: 'CommerceOrder', entityId: initial.id } });
    if (!order || order.kind !== 'EVENT' || !['FULFILLMENT_REVIEW', 'PAID'].includes(order.status) ||
        order.stripePaymentIntentId !== intent.id || order.stripeCheckoutSessionId !== session.id ||
        order.amountCents !== initial.amountCents || order.currency !== initial.currency || order.refundedAmountCents !== 0 ||
        !order.paidAt || order.failedAt || order.refunds.length || order.userId !== initial.userId || order.occurrenceId !== initial.occurrenceId ||
        !order.occurrence?.template.isEvent || !['SCHEDULED', 'COMPLETED'].includes(order.occurrence.status) ||
        !booking || booking.occurrenceId !== order.occurrenceId || booking.userId !== order.userId || booking.source !== 'STRIPE_EVENT' ||
        booking.status !== 'CONFIRMED' || booking.cancelledAt || booking.updatedAt.toISOString() !== input.bookingUpdatedAt ||
        (booking.attendance && !['CHECKED_IN', 'ATTENDED'].includes(booking.attendance.status)) || order.paymentRecords.length !== 1) reject();
    const payment = order.paymentRecords[0];
    if (payment.status !== 'SUCCEEDED' || payment.kind !== 'EVENT' || payment.userId !== order.userId ||
        payment.stripePaymentIntentId !== intent.id || payment.amountCents !== order.amountCents || payment.currency !== order.currency ||
        payment.refundedAmountCents !== 0 || payment.purchaseId || payment.membershipId ||
        (payment.stripeCheckoutSessionId && payment.stripeCheckoutSessionId !== session.id)) reject();
    const conflict = await tx.bookingTransfer.findFirst({ where: { bookingId: booking.id } });
    const credits = await tx.creditLedgerEntry.findFirst({ where: { bookingId: booking.id } });
    const other = await tx.commerceOrder.findFirst({ where: { id: { not: order.id }, userId: order.userId, occurrenceId: order.occurrenceId, status: { in: ['PAID', 'FULFILLMENT_REVIEW', 'PARTIALLY_REFUNDED', 'REFUNDED'] } } });
    if (conflict || credits || other) reject();
    if (order.status === 'PAID' && prior) return { orderId: order.id, status: 'PAID', alreadyApplied: true, dryRun: input.dryRun };
    if (order.status !== 'FULFILLMENT_REVIEW' || prior || order.updatedAt.toISOString() !== input.orderUpdatedAt) reject();
    if (input.dryRun) return { orderId: order.id, status: order.status, eligible: true, dryRun: true, verifiedAt: verifiedAt.toISOString() };
    const updated = await tx.commerceOrder.updateMany({ where: { id: order.id, status: 'FULFILLMENT_REVIEW', updatedAt: order.updatedAt }, data: { status: 'PAID' } });
    if (updated.count !== 1) reject();
    await tx.auditLog.create({ data: {
      actorId: input.actorId, action, entityType: 'CommerceOrder', entityId: order.id,
      before: { status: order.status, updatedAt: order.updatedAt.toISOString() },
      after: { status: 'PAID', reason: input.reason, bookingId: booking.id, paymentId: payment.id,
        accountId: account.id, paymentIntentId: intent.id, chargeId: charge.id, verifiedAt: verifiedAt.toISOString(),
        scope: 'status-only; no payment, booking, attendance, credit or notification changes' },
    } });
    return { orderId: order.id, status: 'PAID', alreadyApplied: false, dryRun: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 }));
}
