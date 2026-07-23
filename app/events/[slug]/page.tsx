import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, CheckCircle2 } from 'lucide-react';
import { getOwnedEvent, ownedEvents } from '@/lib/rhyze-platform';
import { Button } from '@/components/ui/Button';

export function generateStaticParams() {
  return ownedEvents.map((event) => ({ slug: event.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const event = getOwnedEvent(params.slug);
  if (!event) return { title: 'Event not found' };
  return { title: event.name, description: event.description };
}

export default function EventDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const event = getOwnedEvent(params.slug);
  if (!event) notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 py-20">
      <Link
        href="/events"
        className="focus-ring mb-10 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-rhyze-cream/60 hover:text-rhyze-coral"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All Events
      </Link>

      <section className="grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-start">
        <div>
          <p className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-rhyze-orange">
            <CalendarDays className="h-4 w-4" aria-hidden />
            {event.fullDate} · {event.time}
          </p>
          <h1 className="font-display text-6xl leading-none tracking-wider md:text-8xl">
            {event.name.toUpperCase()}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-rhyze-cream/75">
            {event.description}
          </p>

          <ul className="mt-8 grid gap-3 text-sm font-bold text-rhyze-cream/80">
            {event.bullets.map((bullet) => (
              <li
                key={bullet}
                className="flex gap-3 border-l-2 border-rhyze-gold bg-rhyze-charcoal/70 p-4"
              >
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-rhyze-gold"
                  aria-hidden
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        <aside className="overflow-hidden rounded-3xl border border-rhyze-gold/25 bg-rhyze-charcoal shadow-[0_0_0_1px_rgba(255,199,44,0.2)]">
          <div className="relative aspect-[4/3] bg-rhyze-black">
            <Image
              src={event.photo}
              alt={event.name}
              fill
              sizes="(min-width: 1024px) 28rem, 100vw"
              className="object-cover object-[center_18%]"
            />
          </div>
          <dl className="divide-y divide-white/10 p-6 text-sm">
            <EventDetail label="Instructor" value={event.instructor} />
            <EventDetail label="Price" value={event.price} />
            <EventDetail label="Duration" value={event.duration} />
            <EventDetail
              label="Booked"
              value={`${event.booked}/${event.capacity}`}
            />
            <EventDetail
              label="VIP access"
              value={
                event.eligibleForVip
                  ? 'Eligible monthly choice'
                  : 'Specialty pricing'
              }
            />
          </dl>
          <div className="px-6 pb-6">
            <Button href={event.bookingHref} size="lg" className="w-full">
              Claim Your Spot
            </Button>
          </div>
        </aside>
      </section>
    </main>
  );
}

function EventDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-xs font-black uppercase tracking-wide text-rhyze-cream/45">
        {label}
      </dt>
      <dd className="text-right font-black text-rhyze-cream">{value}</dd>
    </div>
  );
}
