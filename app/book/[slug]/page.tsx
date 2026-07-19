import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Calendar, CheckCircle2, ShieldCheck } from 'lucide-react';
import { classes, getClass } from '@/lib/classes';
import { ownedMemberships, ownedSchedule } from '@/lib/rhyze-platform';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Book on Rhyze',
  robots: { index: false },
};

export function generateStaticParams() {
  return classes.map((c) => ({ slug: c.slug }));
}

export default function BookingPage({ params }: { params: { slug: string } }) {
  const cls = getClass(params.slug);
  const matchingSlot =
    ownedSchedule.find((slot) => slot.classSlug === params.slug) ?? ownedSchedule[0];

  return (
    <main className="mx-auto max-w-6xl px-6 py-20">
      <Link
        href="/classes"
        className="focus-ring mb-10 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-rhyze-cream/60 hover:text-rhyze-coral"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to Classes
      </Link>

      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
            Rhyze Booking
          </p>
          <h1 className="font-display text-6xl tracking-wider md:text-8xl">
            CONFIRM BOOKING
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-rhyze-cream/70">
            Reserve your spot, apply credits or a drop-in, and confirm waiver
            status without leaving the Rhyze website.
          </p>

          <div className="mt-10 rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
            <div className="mb-5 inline-flex rounded-2xl border border-rhyze-coral/40 bg-rhyze-coral/10 p-4">
              <Calendar className="h-8 w-8 text-rhyze-coral" aria-hidden />
            </div>
            <h2 className="font-display text-4xl tracking-wider">
              {cls?.name ?? matchingSlot.className}
            </h2>
            <p className="mt-3 text-rhyze-cream/70">
              {matchingSlot.day}, {matchingSlot.date} · {matchingSlot.time} ·{' '}
              {matchingSlot.instructor} · {matchingSlot.room}
            </p>
            {cls && (
              <p className="mt-5 max-w-2xl text-sm leading-relaxed text-rhyze-cream/70">
                {cls.description}
              </p>
            )}
          </div>
        </div>

        <aside className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-gold">
            Checkout Preview
          </p>
          <div className="space-y-4">
            {ownedMemberships.slice(0, 3).map((plan) => (
              <div
                key={plan.id}
                className="rounded-2xl border border-white/10 bg-rhyze-black/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-2xl tracking-wider">
                      {plan.name}
                    </h3>
                    <p className="text-sm text-rhyze-cream/60">{plan.credits}</p>
                  </div>
                  <span className="font-display text-3xl text-rhyze-gold">
                    {plan.price}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-rhyze-gold/30 bg-rhyze-gold/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-1 h-5 w-5 text-rhyze-gold" aria-hidden />
              <div>
                <h3 className="font-semibold uppercase tracking-wide">
                  Waiver status
                </h3>
                <p className="mt-1 text-sm text-rhyze-cream/70">
                  Signed general studio waiver. Membership terms will be required
                  before recurring billing goes live.
                </p>
              </div>
            </div>
          </div>

          <Button href="/signin" size="lg" className="mt-6 w-full">
            Confirm Booking <CheckCircle2 className="h-5 w-5" aria-hidden />
          </Button>
        </aside>
      </section>
    </main>
  );
}
