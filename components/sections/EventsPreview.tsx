import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { ownedEvents } from '@/lib/rhyze-platform';

type EventsPreviewProps = {
  heading?: string;
  showIntro?: boolean;
};

export function EventsPreview({
  heading = 'UPCOMING EVENTS',
  showIntro = true,
}: EventsPreviewProps) {
  return (
    <section
      id="events"
      className="border-y border-white/5 bg-rhyze-black py-24"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-10 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
              Events
            </p>
            <h2 className="font-display text-5xl tracking-wider md:text-7xl">
              {heading}
            </h2>
            {showIntro && (
              <p className="mt-4 max-w-2xl text-rhyze-cream/65">
                Specialty classes and workshops are listed by date, with Rhyze
                booking, capacity, VIP eligibility, and details in one place.
              </p>
            )}
          </div>
          <Link
            href="/events"
            className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-rhyze-cream/75 hover:border-rhyze-coral hover:text-rhyze-coral"
          >
            View All Events
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        <div className="no-scrollbar grid auto-cols-[minmax(18rem,1fr)] grid-flow-col gap-5 overflow-x-auto pb-4 md:auto-cols-[minmax(23rem,1fr)]">
          {ownedEvents.map((event) => (
            <article
              key={event.id}
              className="group overflow-hidden rounded-3xl border border-rhyze-gold/25 bg-rhyze-charcoal shadow-[0_0_0_1px_rgba(255,199,44,0.2)] transition hover:-translate-y-1 hover:border-rhyze-orange hover:shadow-[0_0_0_1px_rgba(255,122,24,0.55),0_0_30px_rgba(255,122,24,0.18)]"
            >
              <Link href={`/events/${event.slug}`} className="block">
                <div className="relative aspect-[4/3] overflow-hidden bg-rhyze-black">
                  <Image
                    src={event.photo}
                    alt={event.name}
                    fill
                    sizes="(min-width: 768px) 24rem, 18rem"
                    className="object-cover object-[center_18%] transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute left-4 top-4 rounded-full bg-rhyze-black/85 px-3 py-1 text-xs font-black uppercase tracking-widest text-rhyze-gold">
                    {event.date}
                  </div>
                </div>
                <div className="p-5">
                  <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-rhyze-orange">
                    <CalendarDays className="h-4 w-4" aria-hidden />
                    {event.time} · {event.duration}
                  </p>
                  <h3 className="font-display text-4xl leading-none tracking-wider">
                    {event.name}
                  </h3>
                  <p className="mt-3 min-h-12 text-sm font-bold leading-relaxed text-rhyze-cream/65">
                    {event.description}
                  </p>
                  <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/10 pt-4 text-sm font-black">
                    <span className="text-rhyze-gold">{event.price}</span>
                    <span className="text-rhyze-cream/70">
                      {event.booked}/{event.capacity} booked
                    </span>
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
