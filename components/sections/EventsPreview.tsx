import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { loadPublicEventSlots } from '@/lib/domain/schedule/public-schedule-query';

type EventsPreviewProps = {
  heading?: string;
  showIntro?: boolean;
};

export async function EventsPreview({
  heading = 'UPCOMING EVENTS',
  showIntro = true,
}: EventsPreviewProps) {
  const events = await loadPublicEventSlots();

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
                Specialty classes and workshops are listed from today forward,
                using live Rhyze booking counts.
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

        {events.length ? (
          <div className="no-scrollbar grid auto-cols-[minmax(18rem,1fr)] grid-flow-col gap-5 overflow-x-auto pb-4 md:auto-cols-[minmax(23rem,1fr)]">
            {events.map((event) => (
              <article
                key={event.id}
                className="group overflow-hidden rounded-3xl border border-rhyze-gold/25 bg-rhyze-charcoal shadow-[0_0_0_1px_rgba(255,199,44,0.2)] transition hover:-translate-y-1 hover:border-rhyze-orange hover:shadow-[0_0_0_1px_rgba(255,122,24,0.55),0_0_30px_rgba(255,122,24,0.18)]"
              >
                <Link href={event.bookingHref} className="block">
                  <div className="relative aspect-[4/3] overflow-hidden bg-rhyze-black">
                    <Image
                      src={event.photo}
                      alt={event.className}
                      fill
                      sizes="(min-width: 768px) 24rem, 18rem"
                      className="object-cover object-[center_18%] transition duration-500 group-hover:scale-105"
                    />
                    <div className="absolute left-4 top-4 rounded-full bg-rhyze-black/85 px-3 py-1 text-xs font-black uppercase tracking-widest text-rhyze-gold">
                      {event.dateLabel}
                    </div>
                  </div>
                  <div className="p-5">
                    <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-rhyze-orange">
                      <CalendarDays className="h-4 w-4" aria-hidden />
                      {event.timeLabel} · {event.duration}
                    </p>
                    <h3 className="font-display text-4xl leading-none tracking-wider">
                      {event.className}
                    </h3>
                    <p className="mt-3 min-h-12 text-sm font-bold leading-relaxed text-rhyze-cream/65">
                      {event.instructor} · {event.room}
                    </p>
                    <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/10 pt-4 text-sm font-black">
                      <span className="text-rhyze-gold">{event.price}</span>
                      {event.booked >= 10 && (
                        <span className="text-rhyze-cream/70">
                          {event.booked}/{event.capacity} booked
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/15 bg-rhyze-charcoal/60 p-8 text-center">
            <h3 className="font-display text-4xl tracking-wider">
              NO UPCOMING EVENTS LISTED
            </h3>
            <p className="mt-3 text-sm text-rhyze-cream/60">
              Check the live schedule for today’s classes and newly added dates.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
