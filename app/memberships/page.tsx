import Link from 'next/link';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { stripeIsConfigured } from '@/lib/payments/stripe';
import {
  isProductAvailable,
  productAvailabilityMessage,
} from '@/lib/catalog/product-availability';
import { productCheckoutCadence } from '@/lib/catalog/product-cadence';
import {
  isRhyze2026PromoEligibleProduct,
  shouldShowRhyze2026PromoCopy,
  removeExpiredRhyze2026PromoCopy,
} from '@/lib/domain/memberships/rhyze-2026-promo';

export const dynamic = 'force-dynamic';

export default async function MembershipsPage() {
  const now = new Date();
  const [session, products] = await Promise.all([
    auth(),
    prisma.product.findMany({
      where: {
        isActive: true,
        isPublic: true,
        kind: { not: 'DROP_IN' },
        OR: [
          { alwaysAvailable: true },
          { availabilityEnd: null },
          { availabilityEnd: { gte: now } },
        ],
      },
      orderBy: { priceCents: 'asc' },
    }),
  ]);
  const signedInDestination = (plan: string) => `/member/membership?plan=${encodeURIComponent(plan)}#available-plans`;
  const signedOutDestination = (plan: string) => {
    const callbackUrl = signedInDestination(plan);
    return `/sign-up?plan=${encodeURIComponent(plan)}&callbackUrl=${encodeURIComponent(callbackUrl)}`;
  };
  return (
    <main className="min-h-screen bg-rhyze-black px-6 py-24 text-rhyze-cream">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Memberships & passes</p>
        <h1 className="mt-4 font-display text-6xl tracking-wider md:text-8xl">PICK YOUR RHYTHM</h1>
        {!stripeIsConfigured() && <p className="mt-6 border-l-4 border-rhyze-gold bg-white/5 p-4 text-sm">Online checkout is in preview mode. The studio can connect Stripe from deployment settings; plan browsing and account setup are ready now.</p>}
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {products.map((product) => {
            const available = isProductAvailable(product, now);
            const availabilityMessage = productAvailabilityMessage(product, now);
            const cadence = productCheckoutCadence(product);
            const promoEligible = shouldShowRhyze2026PromoCopy(now) && isRhyze2026PromoEligibleProduct(product);
            const destination = session?.user ? signedInDestination(product.slug) : signedOutDestination(product.slug);
            return (
            <article key={product.id} className="flex flex-col border-t-4 border-rhyze-orange bg-rhyze-charcoal p-6">
              <p className="text-xs font-black uppercase tracking-widest text-rhyze-gold">{product.kind.replaceAll('_',' ')}</p>
              <h2 className="mt-3 font-display text-4xl tracking-wider">{product.name}</h2>
              <p className="mt-3 flex-1 text-sm text-rhyze-cream/60">{removeExpiredRhyze2026PromoCopy(product.description, now)}</p>
              {promoEligible && (
                <p className="mt-3 rounded bg-rhyze-gold/15 px-3 py-2 text-xs font-black uppercase tracking-widest text-rhyze-gold">
                  Labor Day sale: use RHYZE2026 for 20% off the first 2 months
                </p>
              )}
              <p className="mt-6 text-3xl font-black">${(product.priceCents / 100).toFixed(0)}<span className="text-xs text-rhyze-cream/50">{cadence.label}</span></p>
              {available ? (
                <Link href={destination} className="mt-5 bg-rhyze-gradient px-4 py-3 text-center text-xs font-black uppercase tracking-widest">Choose plan</Link>
              ) : (
                <span className="mt-5 cursor-not-allowed border border-rhyze-gold/40 px-4 py-3 text-center text-xs font-black uppercase tracking-widest text-rhyze-gold" aria-disabled="true">
                  {availabilityMessage || 'Currently unavailable'}
                </span>
              )}
            </article>
          )})}
        </div>
      </div>
    </main>
  );
}
