import type {
  CommerceOrderStatus,
  PaymentRecordStatus,
  PurchaseStatus,
} from '@prisma/client';

export const PURCHASE_REVENUE_STATUSES = [
  'PAID',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const satisfies readonly PurchaseStatus[];

export const COMMERCE_REVENUE_STATUSES = [
  'PAID',
  'FULFILLMENT_REVIEW',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'DISPUTED',
] as const satisfies readonly CommerceOrderStatus[];

export function netCollectedAmountCents(input: {
  amountCents: number;
  refundedAmountCents: number;
}) {
  return Math.max(0, input.amountCents - input.refundedAmountCents);
}

export function sumNetCollectedAmounts(
  items: Array<{ amountCents: number; refundedAmountCents: number }>,
) {
  return items.reduce(
    (total, item) => total + netCollectedAmountCents(item),
    0,
  );
}

export function paymentRecordFinancialTotals(
  items: Array<{
    status: PaymentRecordStatus;
    amountCents: number;
    refundedAmountCents: number;
  }>,
) {
  return items.reduce(
    (totals, item) => {
      if (
        !['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED'].includes(
          item.status,
        )
      ) {
        return totals;
      }
      const grossCents = Math.max(0, item.amountCents);
      const adjustmentCents = item.status === 'DISPUTED'
        ? grossCents
        : Math.max(0, Math.min(grossCents, item.refundedAmountCents));
      return {
        grossCents: totals.grossCents + grossCents,
        adjustmentCents: totals.adjustmentCents + adjustmentCents,
        netCents: totals.netCents + grossCents - adjustmentCents,
      };
    },
    { grossCents: 0, adjustmentCents: 0, netCents: 0 },
  );
}
