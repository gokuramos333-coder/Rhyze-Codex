import type { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { financialLock, type FinancialOperation } from './refund-review';
const id = (value: unknown): string | null =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String(value.id)
      : null;
/** Webhook-first settlement must honor the same reviewed service disposition. */
export async function preserveApprovedRecurringService(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
) {
  if (event.type !== 'charge.refunded') return false;
  const charge = event.data.object as Stripe.Charge;
  const intent = id(charge.payment_intent);
  if (!intent) return false;
  const payment = await tx.paymentRecord.findUnique({
    where: { stripePaymentIntentId: intent },
  });
  if (!payment?.stripeSubscriptionId) return false;
  await financialLock(tx, payment.bookingId, intent);
  const [operation] = await tx.$queryRaw<
    FinancialOperation[]
  >`SELECT * FROM "ApprovedFinancialOperation"
    WHERE "paymentRecordId"=${payment.id} AND kind='REFUND' AND payload->>'servicePolicy'='PRESERVE_RECURRING_SERVICE'`;
  if (!operation) return false;
  const refund = charge.refunds?.data.find(
    (r) => r.metadata?.approvedOperationId === operation.id,
  );
  if (
    !refund ||
    !charge.refunds ||
    charge.refunds.has_more ||
    operation.payload.invoiceId !== payment.stripeInvoiceId ||
    operation.payload.subscriptionId !== payment.stripeSubscriptionId ||
    charge.id !== operation.payload.chargeId ||
    charge.livemode !== operation.payload.livemode ||
    (operation.providerId && operation.providerId !== refund.id) ||
    refund.status !== 'succeeded' ||
    refund.amount !== operation.amountCents ||
    refund.currency !== payment.currency ||
    id(refund.charge) !== charge.id ||
    id(refund.payment_intent) !== intent ||
    charge.refunds.data
      .filter((r) => r.status === 'succeeded')
      .reduce((sum, r) => sum + r.amount, 0) !== charge.amount_refunded ||
    charge.amount_refunded !== payment.amountCents
  )
    throw Error(
      'Approved recurring refund callback requires complete matching receipt evidence',
    );
  return true;
}
