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
  stripePaymentIntentId?: string | null;
  product: { name: string };
};

type CommerceRevenueInput = {
  id: string;
  amountCents: number;
  paidAt: Date | null;
  createdAt: Date;
  userId: string | null;
  kind: string;
  stripePaymentIntentId?: string | null;
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

type PurchaseRefundInput = {
  id: string;
  purchaseId: string;
  amountCents: number;
  createdAt: Date;
};

type CommerceRefundInput = {
  id: string;
  commerceOrderId: string;
  amountCents: number;
  createdAt: Date;
  status?: string;
};

type RefundedPaymentInput = StripeRevenueInput & {
  refundedAmountCents: number;
  updatedAt: Date;
  status?: string;
};

export type ReconciledRefundRecord = RevenueRecord & {
  id: string;
  purchaseId: string | null;
  commerceOrderId: string | null;
  paymentRecordId: string | null;
  adjustmentType: 'REFUND' | 'DISPUTE';
};

const MATCHED_PAYMENT_WINDOW_MS = 24 * 60 * 60 * 1_000;

function fallbackPurchasesWithoutCanonicalPayment(
  purchases: PurchaseRevenueInput[],
  paymentRecords: StripeRevenueInput[],
) {
  const matchedPaymentRecordIds = new Set<string>();
  return purchases.filter((purchase) => {
    if (purchase.amountCents <= 0) return false;
    const purchasePaidAt = purchase.paidAt || purchase.createdAt;
    const matchingRecord = paymentRecords.find((record) => {
      if (matchedPaymentRecordIds.has(record.id)) return false;
      const withinPaymentWindow = Math.abs(
        record.occurredAt.getTime() - purchasePaidAt.getTime(),
      ) <= MATCHED_PAYMENT_WINDOW_MS;
      const exactPaymentIntent = Boolean(
        record.stripePaymentIntentId &&
        record.stripePaymentIntentId === purchase.stripePaymentIntentId,
      );
      const exactPurchase = Boolean(
        purchase.id &&
        record.purchaseId === purchase.id &&
        (record.kind !== 'MEMBERSHIP_RENEWAL' || withinPaymentWindow),
      );
      const sameCustomerCharge = Boolean(
        !record.commerceOrderId &&
        record.userId === purchase.userId &&
        record.amountCents === purchase.amountCents &&
        withinPaymentWindow,
      );
      return exactPaymentIntent || exactPurchase || sameCustomerCharge;
    });
    if (!matchingRecord) return true;
    matchedPaymentRecordIds.add(matchingRecord.id);
    return false;
  });
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
  const fallbackPurchases = fallbackPurchasesWithoutCanonicalPayment(
    input.purchases,
    verifiedPaymentRecords,
  );
  const representedCommerceOrderIds = new Set(
    verifiedPaymentRecords.flatMap((record) => record.commerceOrderId ? [record.commerceOrderId] : []),
  );
  const representedPaymentIntentIds = new Set(
    verifiedPaymentRecords.flatMap((record) => record.stripePaymentIntentId ? [record.stripePaymentIntentId] : []),
  );
  const fallbackCommerceOrders = input.commerceOrders.filter(
    (order) => order.amountCents > 0 &&
      !representedCommerceOrderIds.has(order.id) &&
      !(order.stripePaymentIntentId && representedPaymentIntentIds.has(order.stripePaymentIntentId)),
  );
  const purchasesById = new Map(
    input.purchases.flatMap((purchase) => purchase.id ? [[purchase.id, purchase] as const] : []),
  );
  const purchasesByPaymentIntentId = new Map(
    input.purchases.flatMap((purchase) => purchase.stripePaymentIntentId
      ? [[purchase.stripePaymentIntentId, purchase] as const]
      : []),
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
        (item.stripePaymentIntentId ? purchasesByPaymentIntentId.get(item.stripePaymentIntentId)?.product.name : null) ||
        (item.commerceOrderId ? commerceOrdersById.get(item.commerceOrderId)?.kind.replaceAll('_', ' ') : null) ||
        item.kind.replaceAll('_', ' '),
      source: 'RHYZE' as const,
    })),
  ];
}

export function buildReconciledRefundRecords(input: {
  purchases: Array<PurchaseRevenueInput & {
    id: string;
    refundedAmountCents?: number;
    updatedAt?: Date;
  }>;
  commerceOrders: Array<CommerceRevenueInput & {
    refundedAmountCents?: number;
    updatedAt?: Date;
  }>;
  purchaseRefunds: PurchaseRefundInput[];
  commerceRefunds: CommerceRefundInput[];
  paymentRecords: RefundedPaymentInput[];
}): ReconciledRefundRecord[] {
  const purchasesById = new Map(
    input.purchases.map((purchase) => [purchase.id, purchase] as const),
  );
  const commerceOrdersById = new Map(
    input.commerceOrders.map((order) => [order.id, order] as const),
  );
  const explicitPurchaseRefundCents = new Map<string, number>();
  const explicitCommerceRefundCents = new Map<string, number>();

  const purchaseRefundRecords = input.purchaseRefunds.flatMap((refund) => {
    const purchase = purchasesById.get(refund.purchaseId);
    if (!purchase || refund.amountCents <= 0) return [];
    explicitPurchaseRefundCents.set(
      refund.purchaseId,
      (explicitPurchaseRefundCents.get(refund.purchaseId) ?? 0) +
        refund.amountCents,
    );
    return [{
      id: `purchase-refund-${refund.id}`,
      amountCents: refund.amountCents,
      occurredAt: refund.createdAt,
      customerId: purchase.userId,
      type: purchase.product.name,
      source: 'RHYZE' as const,
      purchaseId: refund.purchaseId,
      commerceOrderId: null,
      paymentRecordId: null,
      adjustmentType: 'REFUND' as const,
    }];
  });

  const commerceRefundRecords = input.commerceRefunds.flatMap((refund) => {
    const order = commerceOrdersById.get(refund.commerceOrderId);
    if (!order || refund.amountCents <= 0 || (refund.status && refund.status !== 'SUCCEEDED')) return [];
    explicitCommerceRefundCents.set(
      refund.commerceOrderId,
      (explicitCommerceRefundCents.get(refund.commerceOrderId) ?? 0) +
        refund.amountCents,
    );
    return [{
      id: `commerce-refund-${refund.id}`,
      amountCents: refund.amountCents,
      occurredAt: refund.createdAt,
      customerId: order.userId || `guest-order-${order.id}`,
      type: order.kind.replaceAll('_', ' '),
      source: 'RHYZE' as const,
      purchaseId: null,
      commerceOrderId: refund.commerceOrderId,
      paymentRecordId: null,
      adjustmentType: 'REFUND' as const,
    }];
  });

  const paymentRefundRecords = selectVerifiedRevenuePaymentRecords(
    input.paymentRecords,
  ).flatMap((payment) => {
    const isDispute = payment.status === 'DISPUTED';
    const refundedAmountCents = Math.max(
      0,
      Math.min(
        payment.amountCents,
        isDispute ? payment.amountCents : payment.refundedAmountCents,
      ),
    );
    if (refundedAmountCents === 0) return [];

    const explicitRemaining = payment.purchaseId
      ? explicitPurchaseRefundCents.get(payment.purchaseId) ?? 0
      : payment.commerceOrderId
        ? explicitCommerceRefundCents.get(payment.commerceOrderId) ?? 0
        : 0;
    const coveredByExplicitRefund = Math.min(
      refundedAmountCents,
      explicitRemaining,
    );
    if (payment.purchaseId) {
      explicitPurchaseRefundCents.set(
        payment.purchaseId,
        explicitRemaining - coveredByExplicitRefund,
      );
    } else if (payment.commerceOrderId) {
      explicitCommerceRefundCents.set(
        payment.commerceOrderId,
        explicitRemaining - coveredByExplicitRefund,
      );
    }

    const unrecordedAmountCents =
      refundedAmountCents - coveredByExplicitRefund;
    if (unrecordedAmountCents === 0) return [];
    const purchase = payment.purchaseId
      ? purchasesById.get(payment.purchaseId)
      : null;
    const order = payment.commerceOrderId
      ? commerceOrdersById.get(payment.commerceOrderId)
      : null;
    return [{
      id: `payment-refund-${payment.id}`,
      amountCents: unrecordedAmountCents,
      occurredAt: payment.updatedAt,
      customerId:
        payment.userId ||
        (payment.membershipId ? `membership-${payment.membershipId}` : null) ||
        (payment.purchaseId ? `purchase-${payment.purchaseId}` : null) ||
        `commerce-${payment.commerceOrderId}`,
      type:
        purchase?.product.name ||
        order?.kind.replaceAll('_', ' ') ||
        payment.kind.replaceAll('_', ' '),
      source: 'RHYZE' as const,
      purchaseId: payment.purchaseId,
      commerceOrderId: payment.commerceOrderId,
      paymentRecordId: payment.id,
      adjustmentType: isDispute ? 'DISPUTE' as const : 'REFUND' as const,
    }];
  });

  const representedPurchaseRefundCents = new Map<string, number>();
  const representedCommerceRefundCents = new Map<string, number>();
  for (const refund of [
    ...purchaseRefundRecords,
    ...commerceRefundRecords,
    ...paymentRefundRecords,
  ]) {
    if (refund.purchaseId) {
      representedPurchaseRefundCents.set(
        refund.purchaseId,
        (representedPurchaseRefundCents.get(refund.purchaseId) ?? 0) +
          refund.amountCents,
      );
    }
    if (refund.commerceOrderId) {
      representedCommerceRefundCents.set(
        refund.commerceOrderId,
        (representedCommerceRefundCents.get(refund.commerceOrderId) ?? 0) +
          refund.amountCents,
      );
    }
  }

  const purchaseBalanceRefundRecords = input.purchases.flatMap((purchase) => {
    const residual = Math.max(
      0,
      (purchase.refundedAmountCents ?? 0) -
        (representedPurchaseRefundCents.get(purchase.id) ?? 0),
    );
    if (residual === 0) return [];
    return [{
      id: `purchase-balance-refund-${purchase.id}`,
      amountCents: residual,
      occurredAt: purchase.updatedAt || purchase.paidAt || purchase.createdAt,
      customerId: purchase.userId,
      type: purchase.product.name,
      source: 'RHYZE' as const,
      purchaseId: purchase.id,
      commerceOrderId: null,
      paymentRecordId: null,
      adjustmentType: 'REFUND' as const,
    }];
  });

  const commerceBalanceRefundRecords = input.commerceOrders.flatMap((order) => {
    const residual = Math.max(
      0,
      (order.refundedAmountCents ?? 0) -
        (representedCommerceRefundCents.get(order.id) ?? 0),
    );
    if (residual === 0) return [];
    return [{
      id: `commerce-balance-refund-${order.id}`,
      amountCents: residual,
      occurredAt: order.updatedAt || order.paidAt || order.createdAt,
      customerId: order.userId || `guest-order-${order.id}`,
      type: order.kind.replaceAll('_', ' '),
      source: 'RHYZE' as const,
      purchaseId: null,
      commerceOrderId: order.id,
      paymentRecordId: null,
      adjustmentType: 'REFUND' as const,
    }];
  });

  return [
    ...purchaseRefundRecords,
    ...commerceRefundRecords,
    ...paymentRefundRecords,
    ...purchaseBalanceRefundRecords,
    ...commerceBalanceRefundRecords,
  ];
}
