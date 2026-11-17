import type { PaymentRecord, Prisma } from '@prisma/client';
import { queueEmail } from '@/lib/notifications/email-queue';
import type { FinancialOperation } from './refund-review';
/** Called in the same transaction as independently verified settlement. */
export async function queueApprovedRefundConfirmation(
  tx: Prisma.TransactionClient,
  payment: PaymentRecord,
  operation: FinancialOperation,
  state: string,
) {
  if (state !== 'SUCCEEDED' || operation.kind !== 'REFUND') return;
  const member = payment.userId
    ? await tx.user.findUnique({ where: { id: payment.userId } })
    : null;
  const to = member?.email ?? payment.customerEmail;
  if (!to) return; // No guessed recipient; the audited provider receipt remains visible.
  await queueEmail(tx, {
    userId: member?.id,
    to,
    template: 'PAYMENT_REFUND_CONFIRMATION',
    subject: 'Your Rhyze refund was issued',
    dedupeKey: `financial-refund-confirmed:${operation.id}`,
    payload: {
      name: member?.name ?? payment.customerName ?? 'Rhyzer',
      itemName:
        payment.productName ??
        (payment.stripeInvoiceId
          ? 'your membership invoice'
          : 'your Rhyze payment'),
      amount: operation.amountCents,
      billingUrl: '/member/billing',
    },
  });
}
