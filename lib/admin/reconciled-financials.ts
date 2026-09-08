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

const INITIAL_MEMBERSHIP_PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1_000;

function isDistinctMembershipRenewal(
  record: StripeRevenueInput,
  purchasesById: Map<string, PurchaseRevenueInput>,
) {
  if (record.kind !== 'MEMBERSHIP_RENEWAL' || !record.purchaseId) return false;
  const originalPurchase = purchasesById.get(record.purchaseId);
  if (!originalPurchase) return true;
  const originalPaidAt = originalPurchase.paidAt || originalPurchase.createdAt;
  return Math.abs(record.occurredAt.getTime() - originalPaidAt.getTime()) >
    INITIAL_MEMBERSHIP_PAYMENT_WINDOW_MS;
}

export function selectStandaloneRevenuePaymentRecords<T extends StripeRevenueInput>(
  records: T[],
  purchases: PurchaseRevenueInput[],
) {
  const purchasesById = new Map(
    purchases.flatMap((purchase) => purchase.id ? [[purchase.id, purchase] as const] : []),
  );
  return records.filter(
    (record) =>
      (record.userId || record.membershipId) &&
      !record.commerceOrderId &&
      (!record.purchaseId || isDistinctMembershipRenewal(record, purchasesById)) &&
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
  const standaloneMemberPayments = selectStandaloneRevenuePaymentRecords(
    visiblePaymentRecords,
    input.purchases,
  );

  return [
    ...input.sombleTransactions.map((item) => ({
      amountCents: item.amountCents,
      occurredAt: item.transferredAt,
      customerId: item.userId,
      type: item.contentType,
      source: 'SOMBLE' as const,
    })),
    ...input.purchases.filter((item) => item.amountCents > 0).map((item) => ({
      amountCents: item.amountCents,
      occurredAt: item.paidAt || item.createdAt,
      customerId: item.userId,
      type: item.product.name,
      source: 'RHYZE' as const,
    })),
    ...input.commerceOrders.filter((item) => item.amountCents > 0).map((item) => ({
      amountCents: item.amountCents,
      occurredAt: item.paidAt || item.createdAt,
      customerId: item.userId || `guest-order-${item.id}`,
      type: item.kind.replaceAll('_', ' '),
      source: 'RHYZE' as const,
    })),
    ...standaloneMemberPayments.map((item) => ({
      amountCents: item.amountCents,
      occurredAt: item.occurredAt,
      customerId: item.userId || `membership-${item.membershipId}`,
      type: item.kind.replaceAll('_', ' '),
      source: 'RHYZE' as const,
    })),
  ];
}
