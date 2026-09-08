import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { ownedEvents } from '@/lib/rhyze-platform';
import { prisma } from '@/lib/db/prisma';
import { sortCatalogByNextOccurrence } from '@/lib/admin/catalog-order';
import { publicBookingCountLabel } from '@/lib/catalog/public-booking-count';
import { occurrenceLocalTimeZone } from '@/lib/domain/schedule/occurrence-management';
import { NewProgramBadge } from '@/components/catalog/NewProgramBadge';

type EventsPreviewProps = {
  heading?: string;
  showIntro?: boolean;
  showAllLink?: boolean;
};

export async function EventsPreview({
  heading = 'UPCOMING EVENTS',
  showIntro = true,
  showAllLink = true,
}: EventsPreviewProps) {
  const displayWindowStart = new Date('2026-08-01T00:00:00-04:00');
  const displayWindowEnd = new Date('2026-10-01T00:00:00-04:00');
  const now = new Date();
  const liveEventRows = await prisma.classTemplate.findMany({
    where: { isEvent: true, isActive: true, archivedAt: null },
    include: {
      occurrences: {
        where: {
          status: 'SCHEDULED',
          startAt: { gte: displayWindowStart, lt: displayWindowEnd },
        },
        include: {
          _count: {
            select: {
              bookings: { where: { status: 'CONFIRMED' } },
            },
          },
        },
        orderBy: { startAt: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });
  const eventCards = sortCatalogByNextOccurrence(liveEventRows)
    .flatMap((event) =>
      event.occurrences.map((occurrence) => ({ event, occurrence })),
    )
    .sort(
      (a, b) => a.occurrence.startAt.getTime() - b.occurrence.startAt.getTime(),
    );

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
          {showAllLink && (
            <Link
              href="/events"
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-rhyze-cream/75 hover:border-rhyze-coral hover:text-rhyze-coral"
            >
              View All Events
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </div>

        <div className="no-scrollbar grid auto-cols-[minmax(18rem,1fr)] grid-flow-col gap-5 overflow-x-auto pb-4 md:auto-cols-[minmax(23rem,1fr)]">
          {eventCards.map(({ event, occurrence }) => {
            const fallback = ownedEvents.find((item) => item.slug === event.slug);
            const isClosed = occurrence.startAt.getTime() < now.getTime();
            const bookingLabel = publicBookingCountLabel(
              occurrence._count.bookings + occurrence.historicalSignupCount,
              occurrence.capacity,
            );
            const cardContent = (
              <>
                <div className="relative aspect-[4/3] overflow-hidden bg-rhyze-black">
                  <Image
                    src={event.imageUrl || fallback?.photo || '/brand/rhyze-logo-header.png'}
                    alt={event.name}
                    fill
                    sizes="(min-width: 768px) 24rem, 18rem"
                    className="object-cover object-[center_18%] transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute left-4 top-4 rounded-full bg-rhyze-black/85 px-3 py-1 text-xs font-black uppercase tracking-widest text-rhyze-gold">
                    {occurrence.startAt.toLocaleDateString('en-US', {
                      timeZone: occurrenceLocalTimeZone(),
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                  <div
                    className={`absolute bottom-4 left-4 rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${
                      isClosed
                        ? 'bg-rhyze-cream/90 text-rhyze-black'
                        : 'bg-rhyze-coral text-rhyze-black'
                    }`}
                  >
                    {isClosed ? 'Bookings closed' : 'Booking available'}
                  </div>
                </div>
                <div className="p-5">
                  <div className="mb-3"><NewProgramBadge slug={event.slug} /></div>
                  <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-rhyze-orange">
                    <CalendarDays className="h-4 w-4" aria-hidden />
                    {occurrence.startAt.toLocaleTimeString('en-US', {
                      timeZone: occurrenceLocalTimeZone(),
                      hour: 'numeric',
                      minute: '2-digit',
                    })} · {event.durationMinutes} min
                  </p>
                  <h3 className="font-display text-4xl leading-none tracking-wider">
                    {event.name}
                  </h3>
                  <p className="mt-3 min-h-12 text-sm font-bold leading-relaxed text-rhyze-cream/65">
                    {event.description}
                  </p>
                  <div className="mt-5 flex items-center justify-between gap-4 border-t border-white/10 pt-4 text-sm font-black">
                    <span className="text-rhyze-gold">${((event.dropInPriceCents || 0) / 100).toFixed(0)}</span>
                    <span className="text-rhyze-cream/70">{bookingLabel}</span>
                  </div>
                </div>
              </>
            );

            return (
              <article
                key={`${event.id}-${occurrence.id}`}
                className={`group overflow-hidden rounded-3xl border bg-rhyze-charcoal shadow-[0_0_0_1px_rgba(255,199,44,0.2)] transition ${
                  isClosed
                    ? 'border-white/10 opacity-75'
                    : 'border-rhyze-gold/25 hover:-translate-y-1 hover:border-rhyze-orange hover:shadow-[0_0_0_1px_rgba(255,122,24,0.55),0_0_30px_rgba(255,122,24,0.18)]'
                }`}
              >
                {isClosed ? (
                  <div className="block">{cardContent}</div>
                ) : (
                  <Link href={`/events/${event.slug}`} className="block">
                    {cardContent}
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
