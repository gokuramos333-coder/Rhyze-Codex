import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { startCheckoutAction } from './actions';

const resultMessages: Record<string, string> = {
  stripe: 'This plan is ready, but secure payments are not connected yet. Please contact the studio.',
  success: 'Thanks! Stripe is confirming your purchase now.',
  cancelled: 'Checkout cancelled—nothing was charged.',
  unavailable: 'That plan is no longer available.',
};

export default async function MemberMembershipPage({ searchParams }: { searchParams: { result?: string } }) {
  const user = await requireArea('member');
  const [products, memberships, credits] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true, isPublic: true }, orderBy: { priceCents: 'asc' } }),
    prisma.membership.findMany({ where: { userId: user.id }, include: { product: true }, orderBy: { createdAt: 'desc' } }),
    prisma.creditAccount.findMany({ where: { userId: user.id }, include: { entries: true } }),
  ]);
  const balance = credits.reduce((sum, account) => sum + account.entries.reduce((amount, entry) => amount + entry.quantity, 0), 0);
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Access & credits</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">MY MEMBERSHIP</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="border-t-4 border-rhyze-gold bg-white p-6"><p className="text-xs font-black uppercase tracking-widest">Available credits</p><p className="mt-2 font-display text-6xl">{balance}</p></div>
        <div className="border-t-4 border-rhyze-coral bg-white p-6"><p className="text-xs font-black uppercase tracking-widest">Active plans</p><p className="mt-2 font-display text-6xl">{memberships.filter((item) => ['ACTIVE','TRIALING'].includes(item.status)).length}</p></div>
      </div>
      {searchParams.result && <p className="mt-6 border-l-4 border-rhyze-coral bg-white p-4 font-bold">{resultMessages[searchParams.result] || 'Membership updated.'}</p>}
      <h2 className="mt-10 font-display text-4xl tracking-wider">AVAILABLE PLANS</h2>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {products.map((product) => (
          <article key={product.id} className="bg-white p-6">
            <h3 className="font-display text-3xl tracking-wider">{product.name}</h3>
            <p className="mt-2 text-sm text-rhyze-black/55">{product.description}</p>
            <div className="mt-5 flex items-center justify-between gap-4">
              <strong>${(product.priceCents/100).toFixed(2)}</strong>
              <form action={startCheckoutAction}><input type="hidden" name="productId" value={product.id}/><button className="bg-rhyze-gradient px-4 py-3 text-xs font-black uppercase tracking-widest">Buy securely</button></form>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
