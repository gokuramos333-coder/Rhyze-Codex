import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { prisma } from '@/lib/db/prisma';
import { membershipDisplayDetails } from '@/lib/catalog/membership-copy';
import {
  isProductAvailable,
  productAvailabilityMessage,
} from '@/lib/catalog/product-availability';
import { auth } from '@/auth';
import { productCheckoutCadence } from '@/lib/catalog/product-cadence';
import { removeExpiredRhyze2026PromoCopy } from '@/lib/domain/memberships/rhyze-2026-promo';

export async function PricingCards() {
  const session = await auth();
  const now = new Date();
  const products = await prisma.product.findMany({
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
    orderBy: [{ displayOrder: 'asc' }, { priceCents: 'asc' }],
  });
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      {products.map((product) => {
        const cadence = productCheckoutCadence(product).label;
        const displayDescription = removeExpiredRhyze2026PromoCopy(product.description, now);
        const details = membershipDisplayDetails({ ...product, description: displayDescription });
        const popular = product.name.toLowerCase() === 'ritual';
        const availabilityMessage = productAvailabilityMessage(product, now);
        const available = isProductAvailable(product, now);
        const memberDestination = `/member/membership?plan=${encodeURIComponent(product.slug)}#available-plans`;
        const choosePlanHref = session?.user?.id
          ? memberDestination
          : `/sign-up?plan=${encodeURIComponent(product.slug)}&callbackUrl=${encodeURIComponent(memberDestination)}`;
        return (
        <div
          key={product.id}
          className={cn(
            'relative flex flex-col overflow-hidden rounded-3xl border bg-rhyze-charcoal p-6 transition hover:-translate-y-1',
            popular
              ? 'border-rhyze-coral shadow-glow'
              : 'border-white/10 hover:border-rhyze-coral/40',
          )}
        >
          {popular && (
            <div className="absolute -right-14 top-5 rotate-45 bg-rhyze-gradient px-14 py-1 text-[10px] font-bold uppercase tracking-widest text-rhyze-black">
              Most Popular
            </div>
          )}
          <div
            className={cn(
              'mb-5 h-1 rounded-full',
              popular
                ? 'bg-rhyze-gradient'
                : 'bg-gradient-to-r from-white/10 to-transparent',
            )}
          />
          <h3 className="mb-2 font-display text-2xl tracking-wider">
            {product.name}
          </h3>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="font-display text-5xl text-rhyze-cream">
              ${(product.priceCents / 100).toFixed(product.priceCents % 100 ? 2 : 0)}
            </span>
            <span className="text-sm text-rhyze-cream/60">{cadence}</span>
          </div>
          {(product.includedCredits || product.isUnlimited) && (
            <p className="mb-4 text-xs uppercase tracking-widest text-rhyze-gold">
              {product.isUnlimited ? 'Unlimited access' : `${product.includedCredits} credits`}
            </p>
          )}
          <p className="sr-only">{displayDescription}</p>
          <ul className="mb-6 flex-1 space-y-2 text-sm text-rhyze-cream/75">
            {details.map((bullet) => (
              <li key={bullet} className="flex gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-rhyze-gold"
                  aria-hidden
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          {available ? (
            <Button
              href={choosePlanHref}
              variant={popular ? 'primary' : 'outline'}
              className="w-full"
            >
              Choose Plan
            </Button>
          ) : (
            <Button disabled variant="outline" className="w-full">
              {availabilityMessage || 'Currently unavailable'}
            </Button>
          )}
        </div>
      )})}
    </div>
  );
}
