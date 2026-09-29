import { HistoricalReconciliationControl } from '@/components/admin/HistoricalReconciliationControl';
import { FinancialReportView } from '@/components/admin/FinancialReportView';
import { loadFinancialReport, financialReportQuery, formatReportMoney, type FinancialReportParams } from '@/lib/admin/financial-report';
import Link from 'next/link';
import { Download } from 'lucide-react';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { stripeIsConfigured } from '@/lib/payments/stripe';
import { linkPaymentRecordToMemberAction, refreshStripePaymentsAction, refundCommerceOrderAction, refundPurchaseAction } from './actions';
import { splitCommerceOrders } from '@/lib/admin/payment-sections';
import { LiveDataRefresh } from '@/components/live/LiveDataRefresh';
import { excludeSombleBackedStripePaymentRecords } from '@/lib/admin/payment-record-dedupe';
import { formatPaymentDateTime } from '@/lib/admin/payment-date-time';
import { isVisiblePaymentHistoryPurchase } from '@/lib/payments/payment-history-visibility';
import {
  netCollectedAmountCents,
} from '@/lib/admin/net-revenue';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
type CommerceOrderRow = Prisma.CommerceOrderGetPayload<{
  include: { user: true; items: true; refunds: true; occurrence: { include: { template: true } } };
}>;
type PaymentRecordRow = Prisma.PaymentRecordGetPayload<{
  include: {
    user: true;
    purchase: { include: { product: true } };
    membership: { include: { product: true } };
    commerceOrder: { include: { items: true; occurrence: { include: { template: true } } } };
  };
}>;

function paymentRecordSource(record: PaymentRecordRow) {
  return record.productName || record.membership?.product.name ||
    record.purchase?.product.name ||
    record.commerceOrder?.occurrence?.template.name ||
    record.commerceOrder?.items.map((item) => item.name).join(', ') ||
    record.kind.replaceAll('_', ' ');
}

export default async function PaymentsPage({
  searchParams,
}: { searchParams: Promise<FinancialReportParams & { result?: string }> }) {
  const params = await searchParams;
  const result = params.result;
  const report = await loadFinancialReport(params);
  const dateRange = { gte: report.range.start, lte: report.range.end };
  const [purchases, commerceOrders, paymentRecords, historical] = await Promise.all([
    prisma.purchase.findMany({
      where: { OR: [{ paidAt: dateRange }, { paidAt: null, createdAt: dateRange }] },
      include: { user: true, product: true, invoice: true },
      orderBy: { createdAt: 'desc' },

    }),
    prisma.commerceOrder.findMany({
      where: { OR: [{ paidAt: dateRange }, { paidAt: null, createdAt: dateRange }] },
      include: { user: true, items: true, refunds: true, occurrence: { include: { template: true } } },
      orderBy: { createdAt: 'desc' },

    }),
    prisma.paymentRecord.findMany({
      where: { occurredAt: dateRange },
      include: {
        user: true,
        purchase: { include: { product: true } },
        membership: { include: { product: true } },
        commerceOrder: {
          include: { items: true, occurrence: { include: { template: true } } },
        },
      },
      orderBy: { occurredAt: 'desc' },

    }),
    prisma.sombleTransaction.findMany({
      where: { transferredAt: dateRange },
      include: { user: true },
      orderBy: { transferredAt: 'desc' },
    }),
  ]);
  const paymentIds = new Set(report.rows.map(row => row.paymentRecordId));
  const purchaseIds = new Set(report.rows.map(row => row.purchaseId));
  const orderIds = new Set(report.rows.map(row => row.commerceOrderId));
  const references = new Set(report.rows.map(row => row.reference));
  const visiblePaymentRecords = excludeSombleBackedStripePaymentRecords(paymentRecords, historical).filter(record => paymentIds.has(record.id));
  const visiblePurchases = purchases.filter(isVisiblePaymentHistoryPurchase).filter(item => purchaseIds.has(item.id));
  const { events, merchandise } = splitCommerceOrders(commerceOrders.filter(order => orderIds.has(order.id)));

  return (
    <>
      <LiveDataRefresh />
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
            Revenue ledger
          </p>
          <h1 className="mt-3 font-display text-6xl tracking-wider">SALES</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={refreshStripePaymentsAction}>
            <button
              type="submit"
              disabled={!stripeIsConfigured()}
              className="bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase text-rhyze-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              Refresh from Stripe
            </button>
          </form>
          <Link
            href={`/api/reports/revenue?${financialReportQuery(params)}`}
            className="inline-flex items-center gap-2 bg-rhyze-black px-5 py-3 text-xs font-black uppercase text-white"
          >
            <Download className="h-4 w-4" /> Export filtered entries
          </Link>
        </div>
      </div>

      {result === 'refreshed' && (
        <p className="mt-4 border-l-4 border-rhyze-gold bg-white p-4 text-sm font-bold">Stripe payment records were refreshed.</p>
      )}
      {result === 'sync-error' && (
        <p className="mt-4 border-l-4 border-rhyze-coral bg-white p-4 text-sm font-bold text-red-800">Stripe refresh failed. Existing payment data has not been deleted; please try again or check the Stripe job log.</p>
      )}
      {result === 'refund-issued' && (
        <p className="mt-4 border-l-4 border-emerald-600 bg-white p-4 text-sm font-bold text-emerald-900">Stripe refund verified. Rhyze payment, refund, and any linked event booking state were reconciled.</p>
      )}
      {result === 'refund-error' && (
        <p className="mt-4 border-l-4 border-red-700 bg-white p-4 text-sm font-bold text-red-900">Refund was not completed. No success email or refunded booking cleanup was recorded.</p>
      )}
      {result === 'refund-pending' && (
        <p className="mt-4 border-l-4 border-rhyze-gold bg-white p-4 text-sm font-bold text-rhyze-black">Stripe reports this refund is still pending. Rhyze left the order open for a later safe check.</p>
      )}
      {result === 'refund-failed' && (
        <p className="mt-4 border-l-4 border-red-700 bg-white p-4 text-sm font-bold text-red-900">Stripe reported the refund failed or was canceled. No refunded booking cleanup was recorded.</p>
      )}
      {result === 'refund-provider-mismatch' && (
        <p className="mt-4 border-l-4 border-red-700 bg-white p-4 text-sm font-bold text-red-900">Stripe refund details did not match this order. The order needs provider review before retry.</p>
      )}
      {result === 'refund-review' && (
        <p className="mt-4 border-l-4 border-rhyze-coral bg-white p-4 text-sm font-bold text-red-900">Refund needs manual review because booking, transfer, or returned-credit history prevents automatic cleanup.</p>
      )}

      <FinancialReportView report={report} basePath="/admin/payments" />
      <HistoricalReconciliationControl key={`${report.range.start.toISOString()}-${report.range.end.toISOString()}`} from={report.range.start.toISOString()} to={new Date(report.range.end.getTime()+1).toISOString()} configured={stripeIsConfigured()} />
      <p className="mt-6 border-l-4 border-rhyze-gold bg-white p-4 text-sm font-bold">Payment management below shows original payments collected in the selected period. These operational records can represent the same payment in multiple systems; use the unified financial entries above for totals. Imported history is read-only.</p>
      {!stripeIsConfigured() && (
        <p className="mt-3 border-l-4 border-rhyze-coral bg-white p-4 text-sm font-bold">
          Live Stripe keys are not set. New Rhyze purchase and refund controls remain unavailable.
        </p>
      )}

      <span id="native-collected" className="block scroll-mt-24" />
      <section id="native-payment-records" className="mt-8 scroll-mt-24 overflow-x-auto bg-white">
        <div className="border-b border-black/10 p-5">
          <h2 className="font-display text-4xl tracking-wider">NATIVE PAYMENT RECORDS</h2>
          <p className="mt-1 text-sm text-rhyze-black/55">Stripe-confirmed purchases, renewals, event sales, merchandise, and transfer fees.</p>
        </div>
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead><tr className="border-b"><th className="p-4">Customer</th><th>Date</th><th>Source</th><th>Status</th><th>Collected</th><th>Refunded</th><th>Link studio payment</th></tr></thead>
          <tbody>
            {visiblePaymentRecords.map((record) => {
              const source = paymentRecordSource(record);
              const customer = record.user?.name || record.customerName || record.customerEmail || record.user?.email || 'Guest checkout';
              return (
                <tr key={record.id} className="border-b border-black/5">
                  <td className="p-4">{record.user ? <Link href={`/admin/members/${record.user.id}`} className="font-black hover:text-rhyze-coral">{customer}</Link> : customer}</td>
                  <td>{formatPaymentDateTime(record.occurredAt)}</td>
                  <td>{source}</td>
                  <td>{record.status.replaceAll('_', ' ')}</td>
                  <td className="font-black">{formatReportMoney(record.amountCents, record.currency.toUpperCase())}</td>
                  <td>{formatReportMoney(record.refundedAmountCents, record.currency.toUpperCase())}</td>
                  <td className="p-4">
                    {!record.userId && !record.purchaseId && !record.membershipId && !record.commerceOrderId ? (
                      <form action={linkPaymentRecordToMemberAction} className="flex min-w-72 flex-col gap-2 rounded-lg border border-black/10 bg-rhyze-cream/40 p-3">
                        <input type="hidden" name="paymentRecordId" value={record.id} />
                        <label className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-rhyze-black/55">
                          Member email
                          <input
                            name="memberEmail"
                            type="email"
                            defaultValue={record.customerEmail || ''}
                            placeholder="member@email.com"
                            className="mt-1 w-full rounded border border-black/15 bg-white px-2 py-2 text-sm font-bold normal-case tracking-normal"
                            required
                          />
                        </label>
                        <label className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-rhyze-black/55">
                          Link as
                          <select name="linkMode" className="mt-1 w-full rounded border border-black/15 bg-white px-2 py-2 text-sm font-bold normal-case tracking-normal" defaultValue={record.amountCents === 700 ? 'intro-trial' : 'record-only'}>
                            <option value="record-only">Payment record only</option>
                            <option value="intro-trial">$7 intro trial access</option>
                          </select>
                        </label>
                        <button className="rounded-full bg-rhyze-black px-3 py-2 text-xs font-black uppercase text-white">Link payment</button>
                      </form>
                    ) : (
                      <span className="text-xs font-black uppercase text-rhyze-black/35">Linked</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visiblePaymentRecords.length && <p className="p-8 text-rhyze-black/55">No unmatched native Stripe payment records yet.</p>}
      </section>

      <section className="mt-8 overflow-x-auto bg-white">
        <h2 className="border-b border-black/10 p-5 font-display text-4xl tracking-wider">
          NATIVE RHYZE PAYMENTS
        </h2>
        <p className="border-b border-black/10 px-5 py-3 text-sm text-rhyze-black/55">
          Every purchase completed through Rhyze appears here automatically.
        </p>
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-4">Member</th>
              <th>Date &amp; time</th>
              <th>Product</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visiblePurchases.map((item) => (
              <tr key={item.id} className="border-b border-black/5">
                <td className="p-4">{item.user.name || item.user.email}</td>
                <td>{formatPaymentDateTime(item.paidAt || item.createdAt)}</td>
                <td>{item.product.name}</td>
                <td>{item.status}</td>
                <td>{formatReportMoney(item.amountCents, 'currency' in item ? String(item.currency).toUpperCase() : 'UNKNOWN')}</td>
                <td>
                  {item.status === 'PAID' && (
                    <form action={refundPurchaseAction}>
                      <input type="hidden" name="purchaseId" value={item.id} />
                      <button className="text-xs font-black uppercase text-rhyze-coral">Refund</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visiblePurchases.length && <p className="p-8 text-rhyze-black/55">No native payments yet.</p>}
      </section>

      <CommerceOrderSection title="EVENT SALES" orders={events} emptyLabel="No event orders yet." />
      <CommerceOrderSection title="MERCHANDISE SALES" orders={merchandise} emptyLabel="No completed merchandise sales yet." />

      <section id="somble-history" className="mt-8 scroll-mt-24 overflow-x-auto bg-white">
        <h2 className="border-b border-black/10 p-5 font-display text-4xl tracking-wider">
          SOMBLE TRANSFER HISTORY
        </h2>
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-rhyze-black/45">
              <th className="p-4">Transfer date</th>
              <th>Customer</th>
              <th>Type</th>
              <th>Transferred amount</th>
              <th>Transfer ID</th>
              <th>Payment ID</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {historical.filter(item => references.has(item.paymentId)).map((item) => (
              <tr key={item.id} className="border-b border-black/5">
                <td className="p-4">{formatPaymentDateTime(item.transferredAt)}</td>
                <td>{item.user.name || item.supporterName}</td>
                <td>{item.contentType}</td>
                <td className="font-black">{formatReportMoney(item.amountCents, 'currency' in item ? String(item.currency).toUpperCase() : 'UNKNOWN')}</td>
                <td className="font-mono text-xs">{item.transferId}</td>
                <td className="font-mono text-xs">{item.paymentId}</td>
                <td className="text-xs font-black uppercase text-rhyze-black/35">Historical</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function CommerceOrderSection({
  title,
  orders,
  emptyLabel,
}: {
  title: string;
  orders: CommerceOrderRow[];
  emptyLabel: string;
}) {
  return (
    <section className="mt-8 overflow-x-auto bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 p-5">
        <h2 className="font-display text-4xl tracking-wider">{title}</h2>

      </div>
      <p className="border-b border-black/10 px-5 py-3 text-sm text-rhyze-black/55">
        Stripe Checkout orders appear after signed webhook confirmation.
      </p>
      <table className="w-full min-w-[66rem] text-left text-sm">
        <thead><tr className="border-b"><th className="p-4">Customer</th><th>Date &amp; time</th><th>Order</th><th>Status</th><th>Amount</th><th>Refunded</th><th>Action</th></tr></thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-black/5">
              <td className="p-4">{order.user?.name || order.customerName || order.customerEmail || order.user?.email || 'Guest checkout'}</td>
              <td>{formatPaymentDateTime(order.paidAt || order.createdAt)}</td>
              <td>{order.occurrence?.template.name || order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')}</td>
              <td>{order.status.replaceAll('_', ' ')}</td>
              <td>{formatReportMoney(order.status === 'DISPUTED' ? 0 : netCollectedAmountCents(order), order.currency.toUpperCase())}</td>
              <td>
                <span className="block">{formatReportMoney(order.refundedAmountCents, order.currency.toUpperCase())}</span>
                {order.refunds.length > 0 && (
                  <small className="block text-rhyze-black/45">
                    {order.refunds.map((refund) => `${refund.status}${refund.providerStatus ? `/${refund.providerStatus}` : ''}`).join(', ')}
                  </small>
                )}
              </td>
              <td>
                {(order.status === 'PAID' || order.status === 'FULFILLMENT_REVIEW' || order.status === 'PARTIALLY_REFUNDED' || order.status === 'REFUNDED') && order.stripePaymentIntentId && (
                  <form action={refundCommerceOrderAction} className="grid min-w-60 gap-2">
                    <input type="hidden" name="orderId" value={order.id} />
                    <p className="text-[10px] font-bold uppercase text-rhyze-black/55">
                      DB remaining, provider-verified on submit: {formatReportMoney(Math.max(0, order.amountCents - order.refundedAmountCents), order.currency.toUpperCase())}
                    </p>
                    <input name="reason" required minLength={5} maxLength={240} defaultValue={order.status === 'REFUNDED' ? 'Provider refund reconciliation' : undefined} placeholder="Refund reason" className="min-h-9 border border-black/15 px-2 text-xs" />
                    <input name="confirmation" required pattern="REFUND" placeholder="Type REFUND to confirm" className="min-h-9 border border-black/15 px-2 text-xs" />
                    <button className="text-left text-xs font-black uppercase text-rhyze-coral">{order.status === 'REFUNDED' ? 'Check / reconcile refund' : 'Refund remaining cash'}</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!orders.length && <p className="p-8 text-rhyze-black/55">{emptyLabel}</p>}
    </section>
  );
}
