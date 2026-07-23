import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, CheckCircle2, ShieldCheck } from 'lucide-react';
import { getOwnedEvent, ownedEvents } from '@/lib/rhyze-platform';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Book Event on Rhyze',
  robots: { index: false },
};

export function generateStaticParams() {
  return ownedEvents.map((event) => ({ slug: event.slug }));
}

export default function EventBookingPage({
  params,
}: {
  params: { slug: string };
}) {
  const event = getOwnedEvent(params.slug);
  if (!event) notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 py-20">
      <Link
        href={`/events/${event.slug}`}
        className="focus-ring mb-10 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-rhyze-cream/60 hover:text-rhyze-coral"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to Event
      </Link>

      <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
            Event Booking
          </p>
          <h1 className="font-display text-6xl tracking-wider md:text-8xl">
            CLAIM YOUR SPOT
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-rhyze-cream/70">
            Reserve the event, confirm waiver status, and choose specialty
            pricing or eligible VIP access without leaving the Rhyze website.
          </p>

          <div className="mt-10 rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
            <div className="mb-5 inline-flex rounded-2xl border border-rhyze-coral/40 bg-rhyze-coral/10 p-4">
              <Calendar className="h-8 w-8 text-rhyze-coral" aria-hidden />
            </div>
            <h2 className="font-display text-4xl tracking-wider">
              {event.name}
            </h2>
            <p className="mt-3 text-rhyze-cream/70">
              {event.fullDate} · {event.time} · {event.instructor}
            </p>
            <ul className="mt-5 grid gap-2 text-sm text-rhyze-cream/70">
              {event.bullets.slice(0, 3).map((bullet) => (
                <li key={bullet} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rhyze-gold" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <aside className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-gold">
            Checkout Preview
          </p>
          <div className="rounded-2xl border border-white/10 bg-rhyze-black/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-3xl tracking-wider">
                  Specialty Event
                </h3>
                <p className="text-sm text-rhyze-cream/60">
                  {event.booked}/{event.capacity} booked
                  {event.waitlist > 0 ? ` · ${event.waitlist} waitlist` : ''}
                </p>
              </div>
              <span className="font-display text-4xl text-rhyze-gold">
                {event.price}
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-rhyze-gold/30 bg-rhyze-gold/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck
                className="mt-1 h-5 w-5 text-rhyze-gold"
                aria-hidden
              />
              <div>
                <h3 className="font-semibold uppercase tracking-wide">
                  Specialty access
                </h3>
                <p className="mt-1 text-sm text-rhyze-cream/70">
                  VIP members receive 1 eligible specialty event per month when
                  this event is included in the monthly selection.
                </p>
              </div>
            </div>
          </div>

          <Button href="/signin" size="lg" className="mt-6 w-full">
            Confirm Event Booking
            <CheckCircle2 className="h-5 w-5" aria-hidden />
          </Button>
        </aside>
      </section>
    </main>
  );
}
