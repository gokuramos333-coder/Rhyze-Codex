import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { stripeIsConfigured } from '@/lib/payments/stripe';

export const dynamic = 'force-dynamic';

export default async function MembershipsPage() {
  const [session, products] = await Promise.all([
    auth(),
    prisma.product.findMany({ where: { isActive: true, isPublic: true }, orderBy: { priceCents: 'asc' } }),
  ]);
  const destination = session?.user ? '/member/membership' : '/sign-in?callbackUrl=/memberships';
  return (
    <main className="min-h-screen bg-rhyze-black px-6 py-24 text-rhyze-cream">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Memberships & passes</p>
        <h1 className="mt-4 font-display text-6xl tracking-wider md:text-8xl">PICK YOUR RHYTHM</h1>
        {!stripeIsConfigured() && <p className="mt-6 border-l-4 border-rhyze-gold bg-white/5 p-4 text-sm">Online checkout is in preview mode. The studio can connect Stripe from deployment settings; plan browsing and account setup are ready now.</p>}
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {products.map((product) => (
            <article key={product.id} className="flex flex-col border-t-4 border-rhyze-orange bg-rhyze-charcoal p-6">
              <p className="text-xs font-black uppercase tracking-widest text-rhyze-gold">{product.kind.replaceAll('_',' ')}</p>
              <h2 className="mt-3 font-display text-4xl tracking-wider">{product.name}</h2>
              <p className="mt-3 flex-1 text-sm text-rhyze-cream/60">{product.description}</p>
              <p className="mt-6 text-3xl font-black">${(product.priceCents / 100).toFixed(0)}<span className="text-xs text-rhyze-cream/50">{product.billingInterval === 'MONTHLY' ? '/month' : ''}</span></p>
              <Link href={destination} className="mt-5 bg-rhyze-gradient px-4 py-3 text-center text-xs font-black uppercase tracking-widest">Choose plan</Link>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}
