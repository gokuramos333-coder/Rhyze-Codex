import Link from 'next/link';
import { PricingCards } from '@/components/sections/PricingCards';

export async function PricingTeaser() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <div className="mb-12 text-left md:text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          Memberships
        </p>
        <h2 className="font-display text-5xl tracking-wider md:text-7xl">
          PICK YOUR <span className="rhyze-gradient-text">RHYTHM</span>
        </h2>
      </div>

      <PricingCards />

      <div className="mt-10 text-left md:text-center">
        <Link
          href="/join"
          className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold uppercase tracking-wide hover:border-rhyze-coral hover:text-rhyze-coral"
        >
          View Rhyze Memberships →
        </Link>
      </div>
    </section>
  );
}
