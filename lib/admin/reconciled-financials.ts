import type { RevenueRecord } from '@/lib/admin/dashboard-analytics';
import { excludeSombleBackedStripePaymentRecords } from '@/lib/admin/payment-record-dedupe';

type SombleRevenueInput = {
  amountCents: number;
  transferredAt: Date;
  paymentId: string;
  userId: string;
  contentType: string;
};

type PurchaseRevenueInput = {
  id?: string;
  amountCents: number;
  paidAt: Date | null;
  createdAt: Date;
  userId: string;
  product: { name: string };
};

type CommerceRevenueInput = {
  id: string;
  amountCents: number;
  paidAt: Date | null;
  createdAt: Date;
  userId: string | null;
  kind: string;
};

type StripeRevenueInput = {
  id: string;
  amountCents: number;
  occurredAt: Date;
  userId: string | null;
  membershipId: string | null;
  purchaseId: string | null;
  commerceOrderId: string | null;
  stripeEventId: string;
  stripePaymentIntentId: string | null;
  kind: string;
};

const MATCHED_PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1_000;

function purchaseHasCanonicalPaymentRecord(
  purchase: PurchaseRevenueInput,
  paymentRecords: StripeRevenueInput[],
) {
  if (!purchase.id) return false;
  const purchasePaidAt = purchase.paidAt || purchase.createdAt;
  return paymentRecords.some((record) =>
    record.purchaseId === purchase.id &&
    (
      record.kind !== 'MEMBERSHIP_RENEWAL' ||
      Math.abs(record.occurredAt.getTime() - purchasePaidAt.getTime()) <= MATCHED_PAYMENT_WINDOW_MS
    ),
  );
}

export function selectVerifiedRevenuePaymentRecords<T extends StripeRevenueInput>(
  records: T[],
) {
  return records.filter(
    (record) =>
      (record.userId || record.purchaseId || record.membershipId || record.commerceOrderId) &&
      record.amountCents > 0,
  );
}

export function buildReconciledRevenueRecords(input: {
  sombleTransactions: SombleRevenueInput[];
  purchases: PurchaseRevenueInput[];
  commerceOrders: CommerceRevenueInput[];
  paymentRecords: StripeRevenueInput[];
}): RevenueRecord[] {
  const visiblePaymentRecords = excludeSombleBackedStripePaymentRecords(
    input.paymentRecords,
    input.sombleTransactions,
  );
  const verifiedPaymentRecords = selectVerifiedRevenuePaymentRecords(
    visiblePaymentRecords,
  );
  const fallbackPurchases = input.purchases.filter(
    (purchase) => purchase.amountCents > 0 &&
      !purchaseHasCanonicalPaymentRecord(purchase, verifiedPaymentRecords),
  );
  const representedCommerceOrderIds = new Set(
    verifiedPaymentRecords.flatMap((record) => record.commerceOrderId ? [record.commerceOrderId] : []),
  );
  const fallbackCommerceOrders = input.commerceOrders.filter(
    (order) => order.amountCents > 0 && !representedCommerceOrderIds.has(order.id),
  );
  const purchasesById = new Map(
    input.purchases.flatMap((purchase) => purchase.id ? [[purchase.id, purchase] as const] : []),
  );
  const commerceOrdersById = new Map(
    input.commerceOrders.map((order) => [order.id, order] as const),
  );

  return [
    ...input.sombleTransactions.map((item) => ({
      amountCents: item.amountCents,
      occurredAt: item.transferredAt,
      customerId: item.userId,
      type: item.contentType,
      source: 'SOMBLE' as const,
    })),
    ...fallbackPurchases.map((item) => ({
      amountCents: item.amountCents,
      occurredAt: item.paidAt || item.createdAt,
      customerId: item.userId,
      type: item.product.name,
      source: 'RHYZE' as const,
    })),
    ...fallbackCommerceOrders.map((item) => ({
      amountCents: item.amountCents,
      occurredAt: item.paidAt || item.createdAt,
      customerId: item.userId || `guest-order-${item.id}`,
      type: item.kind.replaceAll('_', ' '),
      source: 'RHYZE' as const,
    })),
    ...verifiedPaymentRecords.map((item) => ({
      amountCents: item.amountCents,
      occurredAt: item.occurredAt,
      customerId: item.userId ||
        (item.membershipId ? `membership-${item.membershipId}` : null) ||
        (item.purchaseId ? `purchase-${item.purchaseId}` : null) ||
        `commerce-${item.commerceOrderId}`,
      type: (item.purchaseId ? purchasesById.get(item.purchaseId)?.product.name : null) ||
        (item.commerceOrderId ? commerceOrdersById.get(item.commerceOrderId)?.kind.replaceAll('_', ' ') : null) ||
        item.kind.replaceAll('_', ' '),
      source: 'RHYZE' as const,
    })),
  ];
}
