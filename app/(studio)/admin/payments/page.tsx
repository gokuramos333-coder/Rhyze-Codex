import Link from 'next/link';
import { Download } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { stripeIsConfigured } from '@/lib/payments/stripe';
import { calculateSombleMetrics } from '@/lib/admin/somble-metrics';
import { refundPurchaseAction } from './actions';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function PaymentsPage() {
  const [purchases, historical] = await Promise.all([
    prisma.purchase.findMany({
      include: { user: true, product: true, invoice: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.sombleTransaction.findMany({
      include: { user: true },
      orderBy: { transferredAt: 'desc' },
    }),
  ]);
  const metrics = calculateSombleMetrics(historical);

  return (
    <>
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
        <Card label="Somble transferred revenue" value={money(metrics.transferredRevenueCents)} />
        <Card label="Historical transfers" value={`${historical.length}`} />
        <Card label="Customers with transfers" value={`${metrics.uniqueCustomerCount}`} />
      </div>

      <p className="mt-6 border-l-4 border-rhyze-gold bg-white p-4 text-sm font-bold">
        Somble history is read-only and cannot be refunded through the new Stripe account.
        Amounts may be net of Somble or payment-processing fees.
      </p>
      {!stripeIsConfigured() && (
        <p className="mt-3 border-l-4 border-rhyze-coral bg-white p-4 text-sm font-bold">
          Live Stripe keys are not set. New Rhyze purchase and refund controls remain unavailable.
        </p>
      )}

      <section className="mt-8 overflow-x-auto bg-white">
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
                <td className="p-4">{item.transferredAt.toLocaleDateString()}</td>
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

      <section className="mt-8 overflow-x-auto bg-white">
        <h2 className="border-b border-black/10 p-5 font-display text-4xl tracking-wider">
          NATIVE RHYZE PAYMENTS
        </h2>
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="p-4">Member</th>
              <th>Product</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((item) => (
              <tr key={item.id} className="border-b border-black/5">
                <td className="p-4">{item.user.name || item.user.email}</td>
                <td>{item.product.name}</td>
                <td>{item.status}</td>
                <td>{money(item.amountCents)}</td>
                <td>
                  {item.status === 'PAID' && (
                    <form action={refundPurchaseAction}>
                      <input type="hidden" name="purchaseId" value={item.id} />
                      <button className="text-xs font-black uppercase text-rhyze-coral">
                        Refund
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!purchases.length && <p className="p-8 text-rhyze-black/55">No native payments yet.</p>}
      </section>
    </>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t-4 border-rhyze-orange bg-white p-5">
      <p className="text-xs font-black uppercase text-rhyze-black/45">{label}</p>
      <p className="mt-2 font-display text-5xl tracking-wider">{value}</p>
    </div>
  );
}
