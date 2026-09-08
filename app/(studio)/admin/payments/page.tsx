import Link from 'next/link';
import { Download } from 'lucide-react';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { stripeIsConfigured } from '@/lib/payments/stripe';
import { calculateSombleMetrics } from '@/lib/admin/somble-metrics';
import { linkPaymentRecordToMemberAction, refundCommerceOrderAction, refundPurchaseAction } from './actions';
import { splitCommerceOrders } from '@/lib/admin/payment-sections';
import { LiveDataRefresh } from '@/components/live/LiveDataRefresh';
import { syncRecentStripePaymentRecords } from '@/lib/payments/stripe-payment-sync';
import { excludeSombleBackedStripePaymentRecords } from '@/lib/admin/payment-record-dedupe';
import { formatPaymentDateTime } from '@/lib/admin/payment-date-time';
import { isVisiblePaymentHistoryPurchase } from '@/lib/payments/payment-history-visibility';
import { RefundedBadge } from '@/components/admin/RefundedBadge';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export const dynamic = 'force-dynamic';
export const revalidate = 0;
type CommerceOrderRow = Prisma.CommerceOrderGetPayload<{
  include: { user: true; items: true; occurrence: { include: { template: true } } };
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
  return record.membership?.product.name ||
    record.purchase?.product.name ||
    record.commerceOrder?.occurrence?.template.name ||
    record.commerceOrder?.items.map((item) => item.name).join(', ') ||
    record.kind.replaceAll('_', ' ');
}

export default async function PaymentsPage() {
  await syncRecentStripePaymentRecords(prisma).catch((error) => {
    console.error('Stripe payment sync failed', error);
  });
  const [purchases, commerceOrders, paymentRecords, historical] = await Promise.all([
    prisma.purchase.findMany({
      include: { user: true, product: true, invoice: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.commerceOrder.findMany({
      include: { user: true, items: true, occurrence: { include: { template: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.paymentRecord.findMany({
      include: {
        user: true,
        purchase: { include: { product: true } },
        membership: { include: { product: true } },
        commerceOrder: {
          include: { items: true, occurrence: { include: { template: true } } },
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: 250,
    }),
    prisma.sombleTransaction.findMany({
      include: { user: true },
      orderBy: { transferredAt: 'desc' },
    }),
  ]);
  const metrics = calculateSombleMetrics(historical);
  const visiblePaymentRecords = excludeSombleBackedStripePaymentRecords(paymentRecords, historical);
  const verifiedPaymentRecords = visiblePaymentRecords.filter(
    (record) => record.userId || record.purchaseId || record.membershipId || record.commerceOrderId,
  );
  const unmatchedPaymentRecords = visiblePaymentRecords.filter(
    (record) => !record.userId && !record.purchaseId && !record.membershipId && !record.commerceOrderId,
  );
  const sombleBackedStripeRecordCount = paymentRecords.length - visiblePaymentRecords.length;
  const visiblePurchases = purchases.filter(isVisiblePaymentHistoryPurchase);
  const nativePaidCents = verifiedPaymentRecords
    .filter((record) => ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(record.status))
    .reduce((total, record) => total + record.amountCents, 0);
  const nativeRefundedCents = verifiedPaymentRecords.reduce((total, record) => total + record.refundedAmountCents, 0);
  const { events, merchandise } = splitCommerceOrders(commerceOrders);

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
        <Link
          href="/api/admin/somble-export?type=transactions"
          className="inline-flex items-center gap-2 bg-rhyze-black px-5 py-3 text-xs font-black uppercase text-white"
        >
          <Download className="h-4 w-4" /> Export Somble Data
        </Link>
      </div>

      <div className="mt-7 grid gap-3 md:grid-cols-3">
        <Card label="Native Rhyze collected" value={money(nativePaidCents)} href="#native-collected" />
        <Card label="Native refunds" value={money(nativeRefundedCents)} href="#native-refunds" />
        <Card label="Native payment records" value={`${verifiedPaymentRecords.length}`} href="#native-payment-records" />
        <Card label="Unmatched Stripe review" value={`${unmatchedPaymentRecords.length}`} href="#native-payment-records" />
        <Card label="Somble transferred revenue" value={money(metrics.transferredRevenueCents)} href="#somble-history" />
        <Card label="Historical transfers" value={`${historical.length}`} href="#somble-history" />
        <Card label="Customers with transfers" value={`${metrics.uniqueCustomerCount}`} href="#somble-history" />
      </div>

      <p className="mt-6 border-l-4 border-rhyze-gold bg-white p-4 text-sm font-bold">
        Somble history is read-only and cannot be refunded through the new Stripe account.
        Amounts may be net of Somble or payment-processing fees. Unmatched Stripe charges stay visible for review but are excluded from collected totals until linked to a Rhyze user/order. {sombleBackedStripeRecordCount > 0 ? `${sombleBackedStripeRecordCount} live Stripe charge${sombleBackedStripeRecordCount === 1 ? '' : 's'} already matched Somble payment IDs and excluded from native totals.` : ''}
      </p>
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
                  <td className="font-black">{money(record.amountCents)}</td>
                  <td>{money(record.refundedAmountCents)}</td>
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

      <section id="native-refunds" className="mt-8 scroll-mt-24 overflow-x-auto bg-white">
        <div className="border-b border-black/10 p-5">
          <h2 className="font-display text-4xl tracking-wider">NATIVE REFUNDS</h2>
          <p className="mt-1 text-sm text-rhyze-black/55">Every refunded amount, linked to the customer and original payment.</p>
        </div>
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead><tr className="border-b"><th className="p-4">Customer</th><th>Original payment date</th><th>What was refunded</th><th>Status</th><th>Refunded amount</th></tr></thead>
          <tbody>
            {visiblePaymentRecords.filter((record) => record.refundedAmountCents > 0).map((record) => (
              <tr key={record.id} className="border-b border-black/5">
                <td className="p-4">{record.user ? <Link href={`/admin/members/${record.user.id}#payment-history`} className="font-black hover:text-rhyze-coral">{record.user.name || record.customerName || record.customerEmail || record.user.email}</Link> : record.customerName || record.customerEmail || 'Guest checkout'}</td>
                <td>{formatPaymentDateTime(record.occurredAt)}</td>
                <td className="font-bold">{paymentRecordSource(record)}</td>
                <td><RefundedBadge /></td>
                <td className="font-black text-red-800">{money(record.refundedAmountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visiblePaymentRecords.some((record) => record.refundedAmountCents > 0) && <p className="p-8 text-rhyze-black/55">No native refunds recorded.</p>}
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
                <td>{money(item.amountCents)}</td>
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
            {historical.map((item) => (
              <tr key={item.id} className="border-b border-black/5">
                <td className="p-4">{formatPaymentDateTime(item.transferredAt)}</td>
                <td>{item.user.name || item.supporterName}</td>
                <td>{item.contentType}</td>
                <td className="font-black">{money(item.amountCents)}</td>
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
  const totalCents = orders
    .filter((order) => order.status === 'PAID' || order.status === 'FULFILLMENT_REVIEW')
    .reduce((total, order) => total + order.amountCents - order.refundedAmountCents, 0);
  return (
    <section className="mt-8 overflow-x-auto bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 p-5">
        <h2 className="font-display text-4xl tracking-wider">{title}</h2>
        <strong className="font-display text-3xl tracking-wider">{money(totalCents)}</strong>
      </div>
      <p className="border-b border-black/10 px-5 py-3 text-sm text-rhyze-black/55">
        Stripe Checkout orders appear after signed webhook confirmation.
      </p>
      <table className="w-full min-w-[58rem] text-left text-sm">
        <thead><tr className="border-b"><th className="p-4">Customer</th><th>Date &amp; time</th><th>Order</th><th>Status</th><th>Amount</th><th>Action</th></tr></thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-black/5">
              <td className="p-4">{order.user?.name || order.customerName || order.customerEmail || order.user?.email || 'Guest checkout'}</td>
              <td>{formatPaymentDateTime(order.paidAt || order.createdAt)}</td>
              <td>{order.occurrence?.template.name || order.items.map((item) => `${item.name} × ${item.quantity}`).join(', ')}</td>
              <td>{order.status.replaceAll('_', ' ')}</td>
              <td>{money(order.amountCents - order.refundedAmountCents)}</td>
              <td>
                {(order.status === 'PAID' || order.status === 'FULFILLMENT_REVIEW') && order.stripePaymentIntentId && (
                  <form action={refundCommerceOrderAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <button className="text-xs font-black uppercase text-rhyze-coral">Refund</button>
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

function Card({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="border-t-4 border-rhyze-orange bg-white p-5 transition hover:-translate-y-0.5 hover:bg-orange-50 hover:shadow-lg">
      <p className="text-xs font-black uppercase text-rhyze-black/45">{label}</p>
      <p className="mt-2 font-display text-5xl tracking-wider">{value}</p>
      <span className="mt-3 block text-[10px] font-black uppercase tracking-widest text-rhyze-coral">View details →</span>
    </Link>
  );
}
