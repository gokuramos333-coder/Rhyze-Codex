import Link from 'next/link';
import { cn } from '@/lib/cn';
import { sombleMembershipsUrl } from '@/lib/somble';
import { Button } from '@/components/ui/Button';

const homeMemberships = [
  {
    id: 'intro-offer',
    name: 'Intro Offer 7-Days',
    price: '$7',
    cadence: '/ 7 credits',
    eyebrow: 'Class Pack',
    popular: false,
    blurb:
      'Starts August 3 when Rhyze officially opens. Includes 7 consecutive days of unlimited access to all standard classes. Excludes all premium specialty classes and workshops. Valid for first-time clients only.',
    cta: 'Join Membership',
  },
  {
    id: 'full-rhythm',
    name: 'Full Rhythm',
    price: '$168',
    cadence: '/ month',
    eyebrow: '8 Classes / Month Membership',
    popular: true,
    blurb:
      'Starts August 3 when Rhyze officially opens. Includes 8 standard classes per billing cycle. 20% off merchandise. Credits do not roll over.',
    cta: 'Join Membership',
  },
  {
    id: 'elevate',
    name: 'Elevate',
    price: '$92',
    cadence: '/ month',
    eyebrow: '4 Classes / Month Membership',
    popular: false,
    blurb:
      'Starts August 3 when Rhyze officially opens. Includes 4 standard classes per billing cycle. 10% off all Rhyze Merchandise. Credits do not roll over.',
    cta: 'Join Membership',
  },
  {
    id: 'vip-access-pass',
    name: 'The VIP Access Pass',
    price: '$199',
    cadence: '/ month',
    eyebrow: 'AUGUST ONLY',
    popular: false,
    blurb:
      'Starts August 3 when Rhyze officially opens. Founding Members lock in $199/month for life. Unlimited full access to all standard classes and 1 specialty class per month. 30% off all Rhyze Fitness merchandise.',
    cta: 'Join Membership',
  },
] as const;

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

      <div className="mb-10 overflow-hidden rounded-3xl bg-rhyze-gradient p-[1px]">
        <div className="flex flex-col items-center justify-between gap-4 rounded-[calc(1.5rem-1px)] bg-rhyze-black p-6 md:flex-row md:p-8">
          <div>
            <p className="font-display text-3xl tracking-wider md:text-5xl">
              MEMBERSHIPS ARE OPEN
            </p>
            <p className="mt-1 text-sm text-rhyze-cream/70">
              Choose your plan on Rhyze, then complete checkout securely on
              Somble.
            </p>
            <p className="mt-2 text-sm font-semibold text-rhyze-gold">
              All memberships and the 7-day trial begin August 3, 2026.
            </p>
          </div>
          <Button
            href={sombleMembershipsUrl}
            size="lg"
            target="_blank"
            rel="noreferrer"
          >
            View Memberships on Somble →
          </Button>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {homeMemberships.map((t) => (
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
            <p className="mb-3 text-xs uppercase tracking-widest text-rhyze-gold">
              {t.eyebrow}
            </p>
            <p className="mb-6 text-sm text-rhyze-cream/70">{t.blurb}</p>
            <Link
              href={sombleMembershipsUrl}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-widest text-rhyze-cream hover:text-rhyze-coral"
            >
              {t.cta} →
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Link
          href={sombleMembershipsUrl}
          target="_blank"
          rel="noreferrer"
          className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-sm font-semibold uppercase tracking-wide hover:border-rhyze-coral hover:text-rhyze-coral"
        >
          View Memberships on Somble →
        </Link>
      </div>
    </section>
  );
}
