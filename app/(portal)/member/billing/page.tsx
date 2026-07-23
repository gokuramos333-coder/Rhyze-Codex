import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export default async function BillingPage() {
  const user = await requireArea('member');
  const purchases = await prisma.purchase.findMany({ where: { userId: user.id }, include: { product: true, invoice: true }, orderBy: { createdAt: 'desc' } });
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Payments</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">BILLING</h1>
      <p className="mt-4 text-rhyze-black/55">Saved payment methods are managed securely through Stripe’s customer portal after the studio connects its live account.</p>
      <div className="mt-8 grid gap-3">
        {purchases.map((purchase) => <article key={purchase.id} className="flex justify-between gap-4 bg-white p-5"><span><strong className="block">{purchase.product.name}</strong><small>{purchase.createdAt.toLocaleDateString()} · {purchase.status}</small></span><strong>${(purchase.amountCents/100).toFixed(2)}</strong></article>)}
        {purchases.length === 0 && <p className="bg-white p-8 text-rhyze-black/55">No purchases or invoices yet.</p>}
      </div>
    </>
  );
}
