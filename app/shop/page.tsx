import type { Metadata } from 'next';
import { products } from '@/lib/products';
import { ProductCard } from '@/components/sections/ProductCard';

export const metadata: Metadata = {
  title: 'Shop',
  description: 'Rhyze-branded gear for the floor and the street.',
};

export default function ShopPage() {
  const availableProducts = products.filter((product) => !product.comingSoon);
  const comingSoonProducts = products.filter((product) => product.comingSoon);

  return (
    <main className="mx-auto max-w-7xl px-6 py-20">
      <section className="mb-16 text-left md:text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          Rhyze Tribe
        </p>
        <h1 className="font-display text-6xl tracking-wider md:text-8xl">
          SHOP THE <span className="rhyze-gradient-text">DROP</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-rhyze-cream/75">
          Cropped tanks and tees designed for how we move. Shop the available
          collection at the studio and preview what is coming next.
        </p>
      </section>

      <section aria-labelledby="available-merchandise">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">
              In Studio Now
            </p>
            <h2
              id="available-merchandise"
              className="mt-2 font-display text-4xl tracking-wider md:text-5xl"
            >
              AVAILABLE MERCH
            </h2>
          </div>
          <p className="max-w-md text-sm text-rhyze-cream/60">
            See both sides, then choose your size and purchase directly at the studio.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {availableProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="mt-20" aria-labelledby="coming-soon-merchandise">
        <div className="mb-8 border-b border-white/10 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-rhyze-gold">
            Next Drop
          </p>
          <h2
            id="coming-soon-merchandise"
            className="mt-2 font-display text-4xl tracking-wider md:text-5xl"
          >
            COMING SOON
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {comingSoonProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="mt-20 rounded-3xl border border-white/10 bg-rhyze-charcoal p-10 text-center">
        <h2 className="font-display text-3xl tracking-wider md:text-4xl">
          MEMBER PROMO CODES
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-rhyze-cream/70">
          Membership holders receive a unique merch promo code: Elevate saves
          10%, Ritual saves 15%, and VIP Access Pass saves 20% at checkout.
        </p>
      </section>
    </main>
  );
}
