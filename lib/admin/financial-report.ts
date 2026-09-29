import {
  classTicketBinding,
  classTicketFulfillment,
} from '@/lib/payments/class-ticket';
import { resolveAnalyticsRange } from '@/lib/admin/analytics-range';
import {
  buildReconciledRevenueRecords,
  buildReconciledRefundRecords,
} from '@/lib/admin/reconciled-financials';
import { excludeSombleBackedStripePaymentRecords } from '@/lib/admin/payment-record-dedupe';

export type FinancialReportParams = {
  range?: string;
  from?: string;
  to?: string;
  page?: string;
  offering?: string;
  occurrence?: string;
  kind?: string;
};
type RevenueInput = Parameters<typeof buildReconciledRevenueRecords>[0];
type RefundInput = Parameters<typeof buildReconciledRefundRecords>[0];
type Customer = { name?: string | null; email?: string | null };
type Details = {
  policyAcceptance?: unknown;
  currency?: string;
  status?: string;
  user?: Customer | null;
  customerName?: string | null;
  customerEmail?: string | null;
  refundedAmountCents?: number;
  updatedAt?: Date;
  livemode?: boolean;
};
export type FinancialReportSources = {
  purchases: Array<
    RevenueInput['purchases'][number] & Details & { id: string }
  >;
  commerceOrders: Array<
    RevenueInput['commerceOrders'][number] &
      Details & {
        occurrenceId?: string | null;
        occurrence?: {
          id: string;
          template: { id?: string; name: string };
        } | null;
        items?: Array<{ name: string }>;
      }
  >;
  paymentRecords: Array<
    RevenueInput['paymentRecords'][number] &
      Details & {
        refundedAmountCents: number;
        updatedAt: Date;
        productName?: string | null;
      }
  >;
  sombleTransactions: Array<
    RevenueInput['sombleTransactions'][number] & {
      id: string;
      user?: Customer;
      supporterName?: string;
    }
  >;
  purchaseRefunds: RefundInput['purchaseRefunds'];
  commerceRefunds: RefundInput['commerceRefunds'];
  providerEvents: Array<{ id: string; type: string; payload: unknown }>;
};
export type FinancialReportRow = {
  id: string;
  occurredAt: Date | null;
  amountCents: number;
  currency: string;
  source: 'RHYZE' | 'SOMBLE';
  entryType: 'COLLECTION' | 'REFUND' | 'DISPUTE' | 'UNMATCHED' | 'FEE';
  providerVerified: boolean;
  allocationRequired: boolean;
  feeKnown?: boolean;
  offering: string;
  offeringKey: string;
  occurrenceId: string | null;
  isEvent: boolean;
  customer: string;
  userId: string | null;
  reference: string;
  providerChargeId: string | null;
  reviewNote: string | null;
  verification: string;
  purchaseId: string | null;
  commerceOrderId: string | null;
  paymentRecordId: string | null;
};
export type FinancialTotals = {
  currency: string;
  grossCents: number;
  refundCents: number;
  netCents: number;
  importedCents: number;
  unmatchedCents: number;
  verifiedGrossCents: number;
  verifiedRefundCents: number;
  verifiedNetCents: number;
  verifiedFeeEntryCount: number;
  verifiedFeeCents: number;
  unverifiedGrossCents: number;
  unverifiedRefundCents: number;
  unallocatedVerifiedCents: number;
  feeCoverageComplete: boolean;
};
const paidStatuses = new Set([
  'PAID',
  'FULFILLMENT_REVIEW',
  'SUCCEEDED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
  'DISPUTED',
]);
// Only spelling normalization, never customer/amount/time guesses, associates offering labels.
export function financialOfferingKey(name: string) {
  return name
    .toLowerCase()
    .replace(/\bw\//g, 'with ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function totalRows(rows: FinancialReportRow[]): FinancialTotals[] {
  const totals = new Map<string, FinancialTotals>();
  for (const row of rows) {
    const item = totals.get(row.currency) ?? {
      currency: row.currency,
      grossCents: 0,
      refundCents: 0,
      netCents: 0,
      importedCents: 0,
      unmatchedCents: 0,
      verifiedGrossCents: 0,
      verifiedRefundCents: 0,
      verifiedNetCents: 0,
      verifiedFeeEntryCount: 0,
      verifiedFeeCents: 0,
      unverifiedGrossCents: 0,
      unverifiedRefundCents: 0,
      unallocatedVerifiedCents: 0,
      feeCoverageComplete: true,
    };
    if (row.entryType === 'FEE') {
      item.verifiedFeeCents += row.amountCents;
      item.verifiedFeeEntryCount += 1;
      totals.set(row.currency, item);
      continue;
    }
    if (row.providerVerified) {
      if (row.entryType === 'COLLECTION') {
        item.verifiedGrossCents += row.amountCents;
        if (row.allocationRequired)
          item.unallocatedVerifiedCents += row.amountCents;
        if (!row.feeKnown) item.feeCoverageComplete = false;
      } else item.verifiedRefundCents += row.amountCents;
    } else if (row.source !== 'SOMBLE' && row.entryType !== 'UNMATCHED') {
      if (row.entryType === 'COLLECTION')
        item.unverifiedGrossCents += row.amountCents;
      else item.unverifiedRefundCents += row.amountCents;
    }
    item.verifiedNetCents = item.verifiedGrossCents - item.verifiedRefundCents;
    if (row.entryType === 'UNMATCHED') item.unmatchedCents += row.amountCents;
    else if (row.source === 'SOMBLE') item.importedCents += row.amountCents;
    else if (row.entryType === 'COLLECTION') item.grossCents += row.amountCents;
    else item.refundCents += row.amountCents;
    item.netCents = item.grossCents - item.refundCents;
    totals.set(row.currency, item);
  }
  return [...totals.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
}

type ProviderBalance = {
  id: string;
  amount?: number;
  fee: number;
  currency: string;
  created: number;
};
type ProviderReceipt = {
  id: string;
  payment_intent?: string | null;
  paid: boolean;
  captured: boolean;
  status: string;
  amount: number;
  amount_captured?: number;
  currency: string;
  created: number;
  capturedAt?: number | null;
  amount_refunded?: number;
  balance_transaction?: ProviderBalance | null;
  refunds?: {
    data: Array<{
      id: string;
      amount: number;
      currency?: string;
      status: string;
      created: number;
    }>;
  };
  disputes?: {
    data: Array<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      created: number;
      balance_transactions?: ProviderBalance[];
    }>;
  };
};
function applyProviderReceipts(
  local: FinancialReportRow[],
  events: FinancialReportSources['providerEvents'],
) {
  const receipts = new Map<
    string,
    { charge: ProviderReceipt; account: string; readAt: string }
  >();
  for (const event of events) {
    if (event.type !== 'rhyze.payment.reconciled') continue;
    const payload = event.payload as {
      account?: string;
      livemode?: boolean;
      reconciledAt?: string;
      data?: { object?: ProviderReceipt };
    } | null;
    const charge = payload?.data?.object;
    if (
      !payload?.livemode ||
      !payload.account ||
      !charge?.id ||
      !charge.paid ||
      !charge.captured ||
      charge.status !== 'succeeded' ||
      !Number.isSafeInteger(charge.amount_captured ?? charge.amount) ||
      (charge.amount_captured ?? charge.amount) <= 0 ||
      !Number.isFinite(charge.created) ||
      charge.created <= 0
    )
      continue;
    const key = `${payload.account}:${charge.id}`;
    const readAt = payload.reconciledAt || '';
    if (!receipts.has(key) || receipts.get(key)!.readAt <= readAt)
      receipts.set(key, { charge, account: payload.account, readAt });
  }
  const staleProviderReceipts: Array<{
    chargeId: string;
    chargeCreatedAt: string;
    lastCheckedAt: string;
    newerEventAt: string;
  }> = [];
  const providerId = (value: unknown): string | null =>
    typeof value === 'string'
      ? value
      : value &&
          typeof value === 'object' &&
          'id' in value &&
          typeof value.id === 'string'
        ? value.id
        : null;
  for (const [key, receipt] of receipts) {
    const checkedAt = Date.parse(receipt.readAt);
    const newerEvent = events.find((event) => {
      if (!/^(charge|refund|dispute)\./.test(event.type)) return false;
      const payload = event.payload as {
        account?: string;
        livemode?: boolean;
        created?: number;
        data?: {
          object?: { id?: unknown; charge?: unknown; payment_intent?: unknown };
        };
      } | null;
      if (
        payload?.livemode !== true ||
        !Number.isFinite(payload.created) ||
        (payload.account && payload.account !== receipt.account) ||
        (Number.isFinite(checkedAt) &&
          payload.created! < Math.floor(checkedAt / 1000))
      )
        return false;
      const object = payload.data?.object;
      return Boolean(
        object &&
        (providerId(object.id) === receipt.charge.id ||
          providerId(object.charge) === receipt.charge.id ||
          (receipt.charge.payment_intent &&
            providerId(object.payment_intent) ===
              receipt.charge.payment_intent)),
      );
    });
    if (newerEvent) {
      const payload = newerEvent.payload as { created: number };
      staleProviderReceipts.push({
        chargeId: receipt.charge.id,
        chargeCreatedAt: new Date(receipt.charge.created * 1000).toISOString(),
        lastCheckedAt: receipt.readAt,
        newerEventAt: new Date(payload.created * 1000).toISOString(),
      });
      receipts.delete(key);
    }
  }
  const coveredReferences = new Set<string>();
  const providerRows: FinancialReportRow[] = [];
  for (const { charge, account } of receipts.values()) {
    coveredReferences.add(charge.id);
    if (charge.payment_intent) coveredReferences.add(charge.payment_intent);
    const linked = local.find(
      (row) =>
        row.reference === charge.payment_intent ||
        row.reference === charge.id ||
        row.providerChargeId === charge.id,
    );
    const balance = charge.balance_transaction;
    const feeAvailable = Boolean(
      balance &&
      Number.isSafeInteger(balance.fee) &&
      Number.isFinite(balance.created) &&
      balance.created > 0,
    );
    const feeKnown =
      feeAvailable &&
      balance?.currency.toUpperCase() === charge.currency.toUpperCase();
    const base: FinancialReportRow = {
      id: `provider-${account}-${charge.id}`,
      occurredAt: new Date((charge.capturedAt || charge.created) * 1000),
      amountCents: charge.amount_captured ?? charge.amount,
      currency: charge.currency.toUpperCase(),
      source: 'RHYZE',
      entryType: 'COLLECTION',
      providerVerified: true,
      feeKnown,
      allocationRequired: !linked || linked.allocationRequired,
      offering: linked?.offering || 'Unallocated Stripe collection',
      offeringKey: linked?.offeringKey || 'unallocated stripe collection',
      occurrenceId: linked?.occurrenceId || null,
      isEvent: linked?.isEvent || false,
      customer: linked?.customer || 'Customer allocation required',
      userId: linked?.userId || null,
      reference: charge.id,
      providerChargeId: charge.id,
      reviewNote: linked?.reviewNote || null,
      verification:
        !linked || linked.allocationRequired
          ? 'Verified live Stripe receipt / allocation required'
          : 'Verified live Stripe receipt',
      purchaseId: linked?.purchaseId || null,
      commerceOrderId: linked?.commerceOrderId || null,
      paymentRecordId: linked?.paymentRecordId || null,
    };
    providerRows.push(base);
    if (feeAvailable && balance)
      providerRows.push({
        ...base,
        id: `provider-fee-${account}-${balance.id}`,
        entryType: 'FEE',
        amountCents: balance.fee,
        currency: balance.currency.toUpperCase(),
        occurredAt: new Date(balance.created * 1000),
      });
    let verifiedRefundCents = 0;
    const refundIds = new Set<string>();
    for (const refund of charge.refunds?.data || []) {
      if (
        refund.status !== 'succeeded' ||
        !refund.id ||
        refundIds.has(refund.id) ||
        !Number.isSafeInteger(refund.amount) ||
        refund.amount <= 0 ||
        !Number.isFinite(refund.created) ||
        refund.created <= 0
      )
        continue;
      refundIds.add(refund.id);
      verifiedRefundCents += refund.amount;
      providerRows.push({
        ...base,
        id: `provider-refund-${account}-${refund.id}`,
        entryType: 'REFUND',
        amountCents: refund.amount,
        currency: (refund.currency || charge.currency).toUpperCase(),
        occurredAt: new Date(refund.created * 1000),
      });
    }
    if ((charge.amount_refunded || 0) > verifiedRefundCents)
      providerRows.push({
        ...base,
        id: `provider-undated-refund-${account}-${charge.id}`,
        entryType: 'REFUND',
        amountCents: charge.amount_refunded! - verifiedRefundCents,
        occurredAt: null,
        verification:
          'Provider refund balance; individual refund date unavailable',
      });
    for (const dispute of charge.disputes?.data || []) {
      const movements = dispute.balance_transactions || [];
      for (const movement of movements) {
        if (
          !Number.isSafeInteger(movement.amount) ||
          !Number.isFinite(movement.created) ||
          movement.created <= 0
        )
          continue;
        providerRows.push({
          ...base,
          id: `provider-dispute-${account}-${movement.id}`,
          entryType: 'DISPUTE',
          amountCents: -movement.amount!,
          currency: movement.currency.toUpperCase(),
          occurredAt: new Date(movement.created * 1000),
        });
        if (Number.isSafeInteger(movement.fee))
          providerRows.push({
            ...base,
            id: `provider-dispute-fee-${account}-${movement.id}`,
            entryType: 'FEE',
            amountCents: movement.fee,
            currency: movement.currency.toUpperCase(),
            occurredAt: new Date(movement.created * 1000),
          });
      }
      if (!movements.length)
        providerRows.push({
          ...base,
          id: `provider-undated-dispute-${account}-${dispute.id}`,
          entryType: 'DISPUTE',
          amountCents: dispute.amount,
          occurredAt: null,
          verification: 'Provider dispute; balance movement unavailable',
        });
    }
  }
  return {
    rows: [
      ...local.filter(
        (row) =>
          !coveredReferences.has(row.reference) &&
          !coveredReferences.has(row.providerChargeId || ''),
      ),
      ...providerRows,
    ],
    staleProviderReceipts,
    receiptCount: receipts.size,
    latestReconciledAt:
      [...receipts.values()]
        .map((x) => x.readAt)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
  };
}

export function buildFinancialReport(
  raw: FinancialReportSources,
  params: FinancialReportParams,
  now = new Date(),
) {
  const range = resolveAnalyticsRange(params, now);
  const testReferences = new Set<string>();
  for (const event of raw.providerEvents) {
    const payload = event.payload as {
      livemode?: boolean;
      data?: {
        object?: { id?: string; payment_intent?: string; livemode?: boolean };
      };
    } | null;
    const object = payload?.data?.object;
    if (payload?.livemode === false || object?.livemode === false) {
      testReferences.add(event.id);
      if (object?.id) testReferences.add(object.id);
      if (typeof object?.payment_intent === 'string')
        testReferences.add(object.payment_intent);
    }
  }
  const eligible = (
    item: Details & {
      stripeEventId?: string;
      stripePaymentIntentId?: string | null;
    },
  ) =>
    (!item.status || paidStatuses.has(item.status)) &&
    item.livemode !== false &&
    !testReferences.has(item.stripeEventId || '') &&
    !testReferences.has(item.stripePaymentIntentId || '');
  const data = {
    ...raw,
    purchases: raw.purchases.filter(eligible),
    commerceOrders: raw.commerceOrders.filter(eligible),
    paymentRecords: raw.paymentRecords.filter(eligible),
  };
  const purchases = new Map(data.purchases.map((x) => [x.id, x]));
  const orders = new Map(data.commerceOrders.map((x) => [x.id, x]));
  const payments = new Map(data.paymentRecords.map((x) => [x.id, x]));
  const imported = new Map(data.sombleTransactions.map((x) => [x.id, x]));
  const purchaseByIntent = new Map(
    data.purchases
      .filter((x) => x.stripePaymentIntentId)
      .map((x) => [x.stripePaymentIntentId!, x]),
  );
  const orderByIntent = new Map(
    data.commerceOrders
      .filter((x) => x.stripePaymentIntentId)
      .map((x) => [x.stripePaymentIntentId!, x]),
  );
  type Identity = {
    id: string;
    purchaseId?: string | null;
    commerceOrderId?: string | null;
    paymentRecordId?: string | null;
    sombleTransactionId?: string | null;
    currency?: string;
    type: string;
    amountCents: number;
    occurredAt: Date;
    dateVerified?: boolean;
    source: 'RHYZE' | 'SOMBLE';
  };
  function enrich(
    record: Identity,
    entryType: FinancialReportRow['entryType'],
  ): FinancialReportRow {
    const payment = record.paymentRecordId
      ? payments.get(record.paymentRecordId)
      : undefined;
    const purchase =
      purchases.get(record.purchaseId || payment?.purchaseId || '') ||
      purchaseByIntent.get(payment?.stripePaymentIntentId || '');
    const order =
      orders.get(record.commerceOrderId || payment?.commerceOrderId || '') ||
      orderByIntent.get(payment?.stripePaymentIntentId || '');
    const somble = imported.get(record.sombleTransactionId || '');
    const ticket = classTicketBinding(purchase?.policyAcceptance);
    const ticketReview =
      classTicketFulfillment(purchase?.policyAcceptance)?.status === 'REVIEW';
    const offering =
      ticket?.name ||
      order?.occurrence?.template.name ||
      order?.items?.map((x) => x.name).join(', ') ||
      purchase?.product.name ||
      payment?.productName ||
      somble?.contentType ||
      record.type;
    const source = purchase || order || payment;
    return {
      id: record.id,
      occurredAt: record.dateVerified === false ? null : record.occurredAt,
      amountCents: record.amountCents,
      currency:
        record.source === 'SOMBLE'
          ? 'UNKNOWN'
          : (record.currency || source?.currency || 'usd').toUpperCase(),
      source: record.source,
      entryType,
      providerVerified: false,
      allocationRequired: entryType === 'UNMATCHED',
      offering,
      offeringKey: financialOfferingKey(offering),
      occurrenceId:
        ticket?.occurrenceId ||
        order?.occurrenceId ||
        order?.occurrence?.id ||
        null,
      reviewNote: ticketReview
        ? 'Paid class ticket needs booking review'
        : null,
      isEvent:
        order?.kind === 'EVENT' ||
        payment?.kind === 'EVENT' ||
        /\bevent\b|seat seduction|hip.hop happy hour|hypnotic heels|mommy.*me/i.test(
          somble?.contentType || '',
        ),
      customer:
        source?.user?.name ||
        source?.user?.email ||
        source?.customerName ||
        source?.customerEmail ||
        somble?.user?.name ||
        somble?.supporterName ||
        'Unknown customer',
      userId: source?.userId || somble?.userId || null,
      providerChargeId: payment?.stripeEventId.startsWith('stripe-sync-charge-')
        ? payment.stripeEventId.slice('stripe-sync-charge-'.length)
        : somble && /^(ch_|py_)/.test(somble.paymentId)
          ? somble.paymentId
          : null,
      reference:
        payment?.stripePaymentIntentId ||
        (payment?.stripeEventId.startsWith('stripe-sync-charge-')
          ? payment.stripeEventId.slice('stripe-sync-charge-'.length)
          : null) ||
        order?.stripePaymentIntentId ||
        purchase?.stripePaymentIntentId ||
        somble?.paymentId ||
        record.id,
      verification:
        record.source === 'SOMBLE'
          ? 'Imported / provider unverified'
          : entryType === 'UNMATCHED'
            ? 'Unmatched / review required'
            : payment
              ? 'Database payment record / provider unverified'
              : 'Database paid order / purchase; provider unverified',
      purchaseId: purchase?.id || null,
      commerceOrderId: order?.id || null,
      paymentRecordId: payment?.id || null,
    };
  }
  const gross = buildReconciledRevenueRecords(data).map((record) =>
    enrich(record as Identity, 'COLLECTION'),
  );
  const adjustments = buildReconciledRefundRecords({
    ...data,
    paymentRecords: excludeSombleBackedStripePaymentRecords(
      data.paymentRecords,
      data.sombleTransactions,
    ),
  }).map((record) => enrich(record, record.adjustmentType));
  const unmatched = excludeSombleBackedStripePaymentRecords(
    data.paymentRecords,
    data.sombleTransactions,
  )
    .filter(
      (x) =>
        !x.userId &&
        !x.purchaseId &&
        !x.membershipId &&
        !x.commerceOrderId &&
        !purchaseByIntent.has(x.stripePaymentIntentId || '') &&
        !orderByIntent.has(x.stripePaymentIntentId || '') &&
        x.amountCents > 0,
    )
    .map((x) =>
      enrich(
        {
          ...x,
          id: `unmatched-${x.id}`,
          paymentRecordId: x.id,
          type: x.kind,
          source: 'RHYZE',
        },
        'UNMATCHED',
      ),
    );
  const matches = (row: FinancialReportRow) =>
    (!params.offering || row.offeringKey === params.offering) &&
    (!params.occurrence || row.occurrenceId === params.occurrence) &&
    (params.kind !== 'event' || row.isEvent);
  const providerLedger = applyProviderReceipts(
    [...gross, ...adjustments, ...unmatched],
    raw.providerEvents,
  );
  const rows = providerLedger.rows
    .filter(matches)
    .filter(
      (row) =>
        row.occurredAt &&
        row.occurredAt >= range.start &&
        row.occurredAt <= range.end,
    )
    .sort(
      (a, b) =>
        b.occurredAt!.getTime() - a.occurredAt!.getTime() ||
        a.id.localeCompare(b.id),
    );
  const unknownDateAdjustments = providerLedger.rows
    .filter(matches)
    .filter((row) => !row.occurredAt);
  const grouped = new Map<string, FinancialReportRow[]>();
  for (const row of rows)
    grouped.set(row.offeringKey, [
      ...(grouped.get(row.offeringKey) || []),
      row,
    ]);
  const offerings = [...grouped]
    .map(([key, entries]) => ({
      key,
      name:
        entries.find((x) => x.source === 'RHYZE')?.offering ||
        entries[0].offering,
      count: entries.length,
      totals: totalRows(entries),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(
    pageCount,
    Math.max(1, Number.parseInt(params.page || '1', 10) || 1),
  );
  return {
    range,
    params,
    rows,
    pageRows: rows.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageCount,
    pageSize,
    totals: totalRows(rows),
    offerings,
    unknownDateAdjustments,
    staleProviderReceipts: providerLedger.staleProviderReceipts,
    providerReceiptCount: providerLedger.receiptCount,
    latestReceiptReconciledAt: providerLedger.latestReconciledAt,
    feesCents: null,
    expensesCents: null,
    profitCents: null,
  };
}
export type FinancialReport = ReturnType<typeof buildFinancialReport>;

export function financialReportCsvRows(
  report: FinancialReport,
): (string | number)[][] {
  return [
    [
      'Entry ID',
      'Date UTC',
      'Date New York',
      'Entry type',
      'Source',
      'Verification',
      'Currency',
      'Amount minor units',
      'Offering',
      'Customer',
      'Reference',
      'Occurrence ID',
      'Purchase ID',
      'Commerce order ID',
      'Payment record ID',
      'Provider verified',
      'Customer allocation required',
      'Net movement minor units',
      'Range from UTC inclusive',
      'Range to UTC inclusive',
      'Latest retained receipt check UTC',
      'Booking review',
      'Stale receipts requiring refresh across account history',
    ],
    ...report.rows.map((row) => [
      row.id,
      row.occurredAt?.toISOString() || '',
      row.occurredAt?.toLocaleString('en-US', {
        timeZone: 'America/New_York',
      }) || '',
      row.entryType,
      row.source,
      row.verification,
      row.currency,
      row.amountCents,
      row.offering,
      row.customer,
      row.reference,
      row.occurrenceId || '',
      row.purchaseId || '',
      row.commerceOrderId || '',
      row.paymentRecordId || '',
      row.providerVerified ? 'true' : 'false',
      row.allocationRequired ? 'true' : 'false',
      ['COLLECTION', 'UNMATCHED'].includes(row.entryType)
        ? row.amountCents
        : -row.amountCents,
      report.range.start.toISOString(),
      report.range.end.toISOString(),
      report.latestReceiptReconciledAt || 'Unverified',
      row.reviewNote || '',
      report.staleProviderReceipts.length,
    ]),
  ];
}
export function financialReportQuery(params: FinancialReportParams) {
  return new URLSearchParams(
    Object.entries(params).filter(
      ([key, value]) =>
        ['range', 'from', 'to', 'offering', 'occurrence', 'kind'].includes(
          key,
        ) && Boolean(value),
    ) as [string, string][],
  ).toString();
}
export function formatReportMoney(cents: number, currency: string) {
  if (currency === 'UNKNOWN')
    return `${(cents / 100).toFixed(2)} (currency unverified)`;
  const format = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  });
  const scale = 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2);
  return format.format(cents / scale);
}
export async function loadFinancialReport(
  params: FinancialReportParams,
  now = new Date(),
) {
  const { prisma } = await import('@/lib/db/prisma');
  // Reconcile the complete source set before date filtering: a September refund can refer to an August payment.
  const [
    purchases,
    commerceOrders,
    paymentRecords,
    sombleTransactions,
    purchaseRefunds,
    commerceRefunds,
    providerEvents,
  ] = await Promise.all([
    prisma.purchase.findMany({ include: { product: true, user: true } }),
    prisma.commerceOrder.findMany({
      include: {
        user: true,
        items: true,
        occurrence: { include: { template: true } },
      },
    }),
    prisma.paymentRecord.findMany({ include: { user: true } }),
    prisma.sombleTransaction.findMany({ include: { user: true } }),
    prisma.refund.findMany(),
    prisma.commerceRefund.findMany(),
    prisma.stripeEvent.findMany({
      select: { id: true, type: true, payload: true },
    }),
  ]);
  return buildFinancialReport(
    {
      purchases,
      commerceOrders,
      paymentRecords,
      sombleTransactions,
      purchaseRefunds,
      commerceRefunds,
      providerEvents,
    },
    params,
    now,
  );
}
