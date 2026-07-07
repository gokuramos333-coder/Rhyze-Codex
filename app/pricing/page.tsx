import type { Metadata } from 'next';
import { trial } from '@/lib/pricing';
import { Button } from '@/components/ui/Button';
import { PricingCards } from '@/components/sections/PricingCards';
import { MemberPerks } from '@/components/sections/MemberPerks';

export const metadata: Metadata = {
  title: 'Pricing & Memberships',
  description:
    'Start with a $7 seven-day trial, then pick your rhythm, weekly, twice-a-week, or unlimited memberships at Rhyze Fitness.',
};

export default function PricingPage() {
  return (
    <main className="py-20">
      <section className="mx-auto max-w-7xl px-6 text-center">
        <p className="mb-4 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
          Pricing
        </p>
        <h1 className="font-display text-6xl tracking-wider md:text-8xl">
          PICK YOUR <span className="rhyze-gradient-text">RHYTHM</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-rhyze-cream/75">
          No contracts, no pressure. Start with our new-member trial, then
          choose the cadence that fits your week.
        </p>
      </section>

      {/* $7 Trial banner, prominent */}
      <section className="mx-auto mt-14 max-w-5xl px-6">
        <div className="overflow-hidden rounded-3xl bg-rhyze-gradient p-[2px]">
          <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-[calc(1.5rem-2px)] bg-rhyze-black p-8 text-center md:p-14">
            <div
              aria-hidden
              className="grain absolute inset-0 opacity-10 mix-blend-overlay"
            />
            <div className="relative">
              <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-gold">
                New Rhyzer Special
              </p>
              <div className="flex flex-wrap items-baseline justify-center gap-3">
                <span className="font-display text-7xl leading-none tracking-wider md:text-9xl">
                  {trial.price}
                </span>
                <span className="font-display text-3xl tracking-widest text-rhyze-cream/80 md:text-5xl">
                  / {trial.duration}
                </span>
              </div>
              <p className="mx-auto mt-4 max-w-md text-sm text-rhyze-cream/70 md:text-base">
                {trial.subtitle}
              </p>
              <Button href={trial.cta.href} size="lg" className="mt-8">
                {trial.cta.label} →
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-7xl px-6">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
              Memberships
            </p>
            <h2 className="font-display text-5xl tracking-wider md:text-6xl">
              MONTHLY PLANS
            </h2>
          </div>
          <p className="max-w-sm text-sm text-rhyze-cream/60">
            All plans auto-renew monthly. Freeze or cancel anytime from your
            member portal.
          </p>
        </div>
        <PricingCards />
      </section>

      <MemberPerks />

      <section className="mx-auto mt-24 max-w-4xl px-6 text-center">
        <h3 className="font-display text-3xl tracking-wider md:text-5xl">
          QUESTIONS?
        </h3>
        <p className="mt-4 text-rhyze-cream/70">
          We&apos;re a small team, we&apos;d love to hear from you. Reach out
          for private events, corporate packages, or anything else not listed
          here.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button href="/contact" size="lg" variant="outline">
            Contact Us
          </Button>
          <Button href="/policies" size="lg" variant="ghost">
            Studio Policies
          </Button>
        </div>
      </section>
    </main>
  );
}
