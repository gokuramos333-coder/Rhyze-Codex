import Link from 'next/link';
import { Check, Star } from 'lucide-react';
import { cn } from '@/lib/cn';
import { tiers, trial } from '@/lib/pricing';
import { Button } from '@/components/ui/Button';

export function PricingTeaser() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <div className="mb-12 text-center">
        <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          Memberships
        </p>
        <h2 className="font-display text-5xl tracking-wider md:text-7xl">
          PICK YOUR <span className="rhyze-gradient-text">RHYTHM</span>
        </h2>
      </div>

      {/* Trial banner */}
      <div className="mb-10 overflow-hidden rounded-3xl bg-rhyze-gradient p-[1px]">
        <div className="flex flex-col items-center justify-between gap-4 rounded-[calc(1.5rem-1px)] bg-rhyze-black p-6 md:flex-row md:p-8">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-rhyze-gold">
              New Rhyzer Special
            </p>
            <p className="mt-1 font-display text-3xl tracking-wider md:text-5xl">
              {trial.price} · {trial.duration}
            </p>
            <p className="mt-1 text-sm text-rhyze-cream/70">{trial.subtitle}</p>
          </div>
          <Button href={trial.cta.href} size="lg">
            {trial.cta.label} →
          </Button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {tiers.map((t) => (
          <div
            key={t.id}
            className={cn(
              'relative overflow-hidden rounded-3xl border bg-rhyze-charcoal p-6 transition hover:-translate-y-1',
              t.popular
                ? 'border-rhyze-coral shadow-glow'
                : 'border-white/10 hover:border-rhyze-coral/40',
            )}
          >
            {t.popular && (
              <div className="absolute -right-12 top-5 rotate-45 bg-rhyze-gradient px-12 py-1 text-[10px] font-bold uppercase tracking-widest text-rhyze-black">
                Most Popular
              </div>
            )}
            <div
              className={cn(
                'mb-4 h-1 rounded-full',
                t.popular
                  ? 'bg-rhyze-gradient'
                  : 'bg-gradient-to-r from-white/10 to-transparent',
              )}
            />
            <h3 className="mb-2 font-display text-2xl tracking-wider">
              {t.name}
            </h3>
            <div className="mb-3 flex items-baseline gap-2">
              <span className="font-display text-5xl text-rhyze-cream">
                {t.price}
              </span>
              <span className="text-sm text-rhyze-cream/60">{t.cadence}</span>
            </div>
            {t.perClass && (
              <p className="mb-3 text-xs text-rhyze-gold">{t.perClass}</p>
            )}
            <p className="mb-6 text-sm text-rhyze-cream/70">{t.blurb}</p>
            <Link
              href={t.cta.href}
              className="focus-ring inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-widest text-rhyze-cream hover:text-rhyze-coral"
            >
              {t.cta.label} →
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Link
          href="/pricing"
          className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold uppercase tracking-wide hover:border-rhyze-coral hover:text-rhyze-coral"
        >
          Full pricing & member perks →
        </Link>
      </div>
    </section>
  );
}
