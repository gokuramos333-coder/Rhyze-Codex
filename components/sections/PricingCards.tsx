import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { tiers } from '@/lib/pricing';
import { Button } from '@/components/ui/Button';

export function PricingCards() {
  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      {tiers.map((t) => (
        <div
          key={t.id}
          className={cn(
            'relative flex flex-col overflow-hidden rounded-3xl border bg-rhyze-charcoal p-6 transition hover:-translate-y-1',
            t.popular
              ? 'border-rhyze-coral shadow-glow'
              : 'border-white/10 hover:border-rhyze-coral/40',
          )}
        >
          {t.popular && (
            <div className="absolute -right-14 top-5 rotate-45 bg-rhyze-gradient px-14 py-1 text-[10px] font-bold uppercase tracking-widest text-rhyze-black">
              Most Popular
            </div>
          )}
          <div
            className={cn(
              'mb-5 h-1 rounded-full',
              t.popular
                ? 'bg-rhyze-gradient'
                : 'bg-gradient-to-r from-white/10 to-transparent',
            )}
          />
          <h3 className="mb-2 font-display text-2xl tracking-wider">
            {t.name}
          </h3>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="font-display text-5xl text-rhyze-cream">
              {t.price}
            </span>
            <span className="text-sm text-rhyze-cream/60">{t.cadence}</span>
          </div>
          {t.perClass && (
            <p className="mb-4 text-xs uppercase tracking-widest text-rhyze-gold">
              {t.perClass}
            </p>
          )}
          <p className="sr-only">{t.blurb}</p>
          <ul className="mb-6 flex-1 space-y-2 text-sm text-rhyze-cream/75">
            {t.bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2">
                <Check
                  className="mt-0.5 h-4 w-4 shrink-0 text-rhyze-gold"
                  aria-hidden
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
          <Button
            href={t.cta.href}
            variant={t.popular ? 'primary' : 'outline'}
            className="w-full"
          >
            {t.cta.label}
          </Button>
        </div>
      ))}
    </div>
  );
}
