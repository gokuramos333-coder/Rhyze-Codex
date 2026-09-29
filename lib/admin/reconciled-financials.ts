import type { RevenueRecord } from '@/lib/admin/dashboard-analytics';
import { excludeSombleBackedStripePaymentRecords } from '@/lib/admin/payment-record-dedupe';

type SombleRevenueInput = {
  id?: string;
  amountCents: number;
  transferredAt: Date;
  paymentId: string;
  userId: string;
  contentType: string;
};

type PurchaseRevenueInput = {
  currency?: string;
  status?: string;
  id?: string;
  amountCents: number;
  paidAt: Date | null;
  createdAt: Date;
  userId: string;
  stripePaymentIntentId?: string | null;
  product: { name: string };
};

type CommerceRevenueInput = {
  currency?: string;
  status?: string;
  id: string;
  amountCents: number;
  paidAt: Date | null;
  createdAt: Date;
  userId: string | null;
  kind: string;
  stripePaymentIntentId?: string | null;
};

type StripeRevenueInput = {
  currency?: string;
  status?: string;
  livemode?: boolean;
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
  stripeRefundId?: string | null;
};

type CommerceRefundInput = {
  id: string;
  commerceOrderId: string;
  amountCents: number;
  createdAt: Date;
  status?: string;
  stripeRefundId?: string | null;
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

export type FinancialProviderEvent = { id: string; type: string; payload: unknown };
export type ReconciledRevenueRecord = RevenueRecord & {
  id: string;
  purchaseId: string | null;
  commerceOrderId: string | null;
  paymentRecordId: string | null;
  sombleTransactionId: string | null;
};

type ProviderAdjustment = { id: string; paymentIntentId: string; amountCents: number; occurredAt: Date; adjustmentType: 'REFUND' | 'DISPUTE' };

function providerAdjustments(events: FinancialProviderEvent[]) {
  const adjustments = new Map<string, ProviderAdjustment>();
  const objectValue = (value: unknown): Record<string, any> => value && typeof value === 'object' ? value as Record<string, any> : {};
  const identifier = (value: unknown) => typeof value === 'string' ? value : objectValue(value).id;
  const sorted = [...events].sort((a, b) => Number(objectValue(a.payload).created || 0) - Number(objectValue(b.payload).created || 0));
  for (const event of sorted) {
    const payload = objectValue(event.payload);
    if (payload.livemode === false) continue;
    const object = objectValue(objectValue(payload.data).object);
    const paymentIntentId = identifier(object.payment_intent);
    if (!paymentIntentId) continue;
    const refunds = event.type === 'charge.refunded'
      ? objectValue(object.refunds).data
      : event.type.startsWith('refund.') ? [object] : [];
    if (Array.isArray(refunds)) for (const value of refunds) {
      const refund = objectValue(value);
      if (typeof refund.id !== 'string') continue;
      if (refund.status !== 'succeeded') { adjustments.delete(refund.id); continue; }
      if (!Number.isSafeInteger(refund.amount) || refund.amount <= 0 || !Number.isFinite(refund.created) || refund.created <= 0) continue;
      adjustments.set(refund.id, { id: refund.id, paymentIntentId, amountCents: refund.amount, occurredAt: new Date(refund.created * 1000), adjustmentType: 'REFUND' });
    }
    if (event.type === 'charge.dispute.created' && typeof object.id === 'string' && Number.isSafeInteger(object.amount) && object.amount > 0 && Number.isFinite(object.created) && object.created > 0) {
      adjustments.set(object.id, { id: object.id, paymentIntentId, amountCents: object.amount, occurredAt: new Date(object.created * 1000), adjustmentType: 'DISPUTE' });
    }
  }
  return adjustments;
}

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
        !(record.stripePaymentIntentId && purchase.stripePaymentIntentId && record.stripePaymentIntentId !== purchase.stripePaymentIntentId) &&
        (record.kind !== 'MEMBERSHIP_RENEWAL' || withinPaymentWindow),
      );
      return exactPaymentIntent || exactPurchase;
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
      record.livemode !== false &&
      (!record.status || ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED'].includes(record.status)) &&
      record.amountCents > 0,
  );
}

export function buildReconciledRevenueRecords(input: {
  sombleTransactions: SombleRevenueInput[];
  purchases: PurchaseRevenueInput[];
  commerceOrders: CommerceRevenueInput[];
  paymentRecords: StripeRevenueInput[];
}): ReconciledRevenueRecord[] {
  const visiblePaymentRecords = excludeSombleBackedStripePaymentRecords(
    input.paymentRecords,
    input.sombleTransactions,
  );
  const verifiedPaymentRecords = selectVerifiedRevenuePaymentRecords(
    visiblePaymentRecords,
  );
  const somblePaymentIds = new Set(input.sombleTransactions.map(item => item.paymentId));
  const fallbackPurchases = fallbackPurchasesWithoutCanonicalPayment(
    input.purchases.filter(item => !item.stripePaymentIntentId || !somblePaymentIds.has(item.stripePaymentIntentId)),
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
      !(order.stripePaymentIntentId && somblePaymentIds.has(order.stripePaymentIntentId)) &&
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
      id: `somble-${item.id || item.paymentId}`,
      sombleTransactionId: item.id || null,
      purchaseId: null, commerceOrderId: null, paymentRecordId: null,
      amountCents: item.amountCents,
      occurredAt: item.transferredAt,
      customerId: item.userId,
      type: item.contentType,
      source: 'SOMBLE' as const,
    })),
    ...fallbackPurchases.map((item) => ({
      id: `purchase-${item.id || item.stripePaymentIntentId || `${item.userId}-${item.createdAt.toISOString()}`}`,
      purchaseId: item.id || null,
      commerceOrderId: null, paymentRecordId: null, sombleTransactionId: null,
      currency: item.currency || 'usd',
      amountCents: item.amountCents,
      occurredAt: item.paidAt || item.createdAt,
      customerId: item.userId,
      type: item.product.name,
      source: 'RHYZE' as const,
    })),
    ...fallbackCommerceOrders.map((item) => ({
      id: `commerce-${item.id}`,
      commerceOrderId: item.id,
      purchaseId: null, paymentRecordId: null, sombleTransactionId: null,
      currency: item.currency || 'usd',
      amountCents: item.amountCents,
      occurredAt: item.paidAt || item.createdAt,
      customerId: item.userId || `guest-order-${item.id}`,
      type: item.kind.replaceAll('_', ' '),
      source: 'RHYZE' as const,
    })),
    ...verifiedPaymentRecords.map((item) => ({
      id: `payment-${item.id}`,
      paymentRecordId: item.id,
      purchaseId: item.purchaseId,
      commerceOrderId: item.commerceOrderId,
      sombleTransactionId: null,
      currency: item.currency || 'usd',
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
  providerEvents?: FinancialProviderEvent[];
}): ReconciledRefundRecord[] {
  const purchasesById = new Map(
    input.purchases.map((purchase) => [purchase.id, purchase] as const),
  );
  const commerceOrdersById = new Map(
    input.commerceOrders.map((order) => [order.id, order] as const),
  );
  const explicitPurchaseRefundCents = new Map<string, number>();
  const explicitCommerceRefundCents = new Map<string, number>();
  const providerRecords = providerAdjustments(input.providerEvents ?? []);
  const explicitPaymentIntentRefundCents = new Map<string, number>();
  const explicitProviderIds = new Set([...input.purchaseRefunds, ...input.commerceRefunds].flatMap(refund => refund.stripeRefundId ? [refund.stripeRefundId] : []));

  const purchaseRefundRecords = input.purchaseRefunds.flatMap((refund) => {
    const purchase = purchasesById.get(refund.purchaseId);
    if (!purchase || refund.amountCents <= 0) return [];
    const provider = refund.stripeRefundId ? providerRecords.get(refund.stripeRefundId) : null;
    const balanceMap = provider ? explicitPaymentIntentRefundCents : explicitPurchaseRefundCents;
    const balanceKey = provider?.paymentIntentId || refund.purchaseId;
    balanceMap.set(balanceKey, (balanceMap.get(balanceKey) ?? 0) + refund.amountCents);
    return [{
      id: `purchase-refund-${refund.id}`,
      amountCents: refund.amountCents,
      occurredAt: (refund.stripeRefundId ? providerRecords.get(refund.stripeRefundId)?.occurredAt : null) || refund.createdAt,
      dateVerified: true,
      currency: purchase.currency || 'usd',
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
    const provider = refund.stripeRefundId ? providerRecords.get(refund.stripeRefundId) : null;
    const balanceMap = provider ? explicitPaymentIntentRefundCents : explicitCommerceRefundCents;
    const balanceKey = provider?.paymentIntentId || refund.commerceOrderId;
    balanceMap.set(balanceKey, (balanceMap.get(balanceKey) ?? 0) + refund.amountCents);
    return [{
      id: `commerce-refund-${refund.id}`,
      amountCents: refund.amountCents,
      occurredAt: (refund.stripeRefundId ? providerRecords.get(refund.stripeRefundId)?.occurredAt : null) || refund.createdAt,
      dateVerified: true,
      currency: order.currency || 'usd',
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
    const knownDisputes = [...providerRecords.values()].filter(item => item.paymentIntentId === payment.stripePaymentIntentId && item.adjustmentType === 'DISPUTE');
    const refundedAmountCents = Math.max(
      0,
      Math.min(
        payment.amountCents,
        isDispute
          ? knownDisputes.length ? payment.refundedAmountCents + knownDisputes.reduce((sum, item) => sum + item.amountCents, 0) : payment.amountCents
          : payment.refundedAmountCents,
      ),
    );
    if (refundedAmountCents === 0) return [];

    const explicitRemaining = payment.purchaseId
      ? explicitPurchaseRefundCents.get(payment.purchaseId) ?? 0
      : payment.commerceOrderId
        ? explicitCommerceRefundCents.get(payment.commerceOrderId) ?? 0
        : 0;
    const exactRemaining = payment.stripePaymentIntentId ? explicitPaymentIntentRefundCents.get(payment.stripePaymentIntentId) ?? 0 : 0;
    const coveredByExactRefund = Math.min(refundedAmountCents, exactRemaining);
    if (payment.stripePaymentIntentId) explicitPaymentIntentRefundCents.set(payment.stripePaymentIntentId, exactRemaining - coveredByExactRefund);
    const coveredByExplicitRefund = Math.min(
      refundedAmountCents - coveredByExactRefund,
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
      refundedAmountCents - coveredByExactRefund - coveredByExplicitRefund;
    if (unrecordedAmountCents === 0) return [];
    const purchase = payment.purchaseId
      ? purchasesById.get(payment.purchaseId)
      : null;
    const order = payment.commerceOrderId
      ? commerceOrdersById.get(payment.commerceOrderId)
      : null;
    const base = {
      id: `payment-refund-${payment.id}`,
      amountCents: unrecordedAmountCents,
      occurredAt: payment.updatedAt,
      dateVerified: false,
      currency: payment.currency || 'usd',
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
    };
    let remaining = unrecordedAmountCents;
    const dated: ReconciledRefundRecord[] = [];
    for (const provider of providerRecords.values()) {
      if (remaining <= 0 || provider.paymentIntentId !== payment.stripePaymentIntentId || explicitProviderIds.has(provider.id) || (!isDispute && provider.adjustmentType !== 'REFUND')) continue;
      const amountCents = Math.min(remaining, provider.amountCents);
      dated.push({ ...base, id: `provider-adjustment-${provider.id}`, adjustmentType: provider.adjustmentType, amountCents, occurredAt: provider.occurredAt, dateVerified: true });
      remaining -= amountCents;
    }
    return remaining > 0 ? [...dated, { ...base, amountCents: remaining }] : dated;
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
      dateVerified: false,
      currency: purchase.currency || 'usd',
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
      dateVerified: false,
      currency: order.currency || 'usd',
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
