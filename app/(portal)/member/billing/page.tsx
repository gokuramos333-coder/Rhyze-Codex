import Link from 'next/link';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { stripeConfiguration } from '@/lib/payments/stripe';
import { openStripePortalAction } from './actions';
import { isVisiblePaymentHistoryPurchase } from '@/lib/payments/payment-history-visibility';

const messages: Record<string, string> = {
  'stripe-not-connected': 'Stripe billing is not connected yet. No payment details were changed.',
  'no-stripe-customer': 'Your Stripe billing profile will be created with your first completed purchase.',
};

export default async function BillingPage(props: { searchParams: Promise<{ result?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await requireArea('member');
  const [{ result }, purchases, paymentRecords, customer] = await Promise.all([
    Promise.resolve(searchParams),
    prisma.purchase.findMany({ where: { userId: user.id }, include: { product: true, invoice: true }, orderBy: { createdAt: 'desc' } }),
    prisma.paymentRecord.findMany({ where: { userId: user.id }, orderBy: { occurredAt: 'desc' }, take: 50 }),
    prisma.user.findUnique({ where: { id: user.id }, select: { stripeCustomerId: true } }),
  ]);
  const visiblePurchases = purchases.filter(isVisiblePaymentHistoryPurchase);
  const canOpenPortal = stripeConfiguration().portal && Boolean(customer?.stripeCustomerId);
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Payments</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">BILLING</h1>
      <p className="mt-4 text-rhyze-black/55">Payment methods and invoices are handled securely in Stripe’s hosted billing portal. Plan changes and cancellations require management review.</p>
      {result && messages[result] && <p className="mt-5 border-l-4 border-rhyze-coral bg-white p-4 font-bold">{messages[result]}</p>}
      <form action={openStripePortalAction} className="mt-6">
        <button
          type="submit"
          disabled={!canOpenPortal}
          className="bg-rhyze-black px-6 py-4 text-xs font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:bg-rhyze-black/25"
        >
          {canOpenPortal ? 'Manage payment method + invoices' : 'Stripe billing available after first purchase'}
        </button>
      </form>
      <Link href="/member/membership" className="mt-3 inline-block border border-rhyze-black px-6 py-4 text-xs font-black uppercase tracking-widest text-rhyze-black">
        Change or cancel plan
      </Link>
      <div className="mt-8 grid gap-3">
        {visiblePurchases.map((purchase) => <article key={purchase.id} className="flex justify-between gap-4 bg-white p-5"><span><strong className="block">{purchase.product.name}</strong><small>{purchase.createdAt.toLocaleDateString()} · {purchase.status}</small></span><strong>${(purchase.amountCents/100).toFixed(2)}</strong></article>)}
        {visiblePurchases.length === 0 && <p className="bg-white p-8 text-rhyze-black/55">No purchases or invoices yet.</p>}
      </div>
      {paymentRecords.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-4xl tracking-wider">PAYMENT HISTORY</h2>
          <div className="mt-4 grid gap-3">
            {paymentRecords.map((record) => (
              <article key={record.id} className="flex justify-between gap-4 bg-white p-5">
                <span><strong className="block">{record.kind.replaceAll('_', ' ')}</strong><small>{record.occurredAt.toLocaleDateString()} · {record.status.replaceAll('_', ' ')}</small></span>
                <strong>${(record.amountCents / 100).toFixed(2)}</strong>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
