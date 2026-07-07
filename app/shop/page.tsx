import type { Metadata } from 'next';
import { products } from '@/lib/products';
import { ProductCard } from '@/components/sections/ProductCard';

export const metadata: Metadata = {
  title: 'Shop',
  description: 'Rhyze-branded gear for the floor and the street.',
};

export default function ShopPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-20">
      <section className="mb-16 text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          Rhyze Tribe
        </p>
        <h1 className="font-display text-6xl tracking-wider md:text-8xl">
          SHOP THE <span className="rhyze-gradient-text">DROP</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-rhyze-cream/75">
          Launch capsule, cropped tees and hats designed for how we move.
          More drops coming as we open the doors.
        </p>
      </section>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>

      <section className="mt-20 rounded-3xl border border-white/10 bg-rhyze-charcoal p-10 text-center">
        <h2 className="font-display text-3xl tracking-wider md:text-4xl">
          MEMBER DISCOUNT
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-rhyze-cream/70">
          All Rhyze members save 10% on every piece, automatically at
          checkout. One more reason to pick your rhythm.
        </p>
      </section>
    </main>
  );
}
