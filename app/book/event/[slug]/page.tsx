import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, ShieldCheck } from 'lucide-react';
import { getOwnedEvent, ownedEvents } from '@/lib/rhyze-platform';
import { EventCheckoutButton } from '@/components/checkout/EventCheckoutButton';
import { NewProgramBadge } from '@/components/catalog/NewProgramBadge';
import { publicBookingCountLabel } from '@/lib/catalog/public-booking-count';
import { MOMMY_AND_ME_SLUG } from '@/lib/payments/commerce-orders';
import { prisma } from '@/lib/db/prisma';
import { WAITLIST_CAPACITY } from '@/lib/domain/bookings/booking-rules';

export const metadata: Metadata = {
  title: 'Book Event on Rhyze',
  robots: { index: false },
};
export const dynamic = 'force-dynamic';

export function generateStaticParams() {
  return ownedEvents.map((event) => ({ slug: event.slug }));
}

export default async function EventBookingPage(
  props: {
    params: Promise<{ slug: string }>;
  }
) {
  const params = await props.params;
  const fallback = getOwnedEvent(params.slug);
  const event = await prisma.classTemplate.findFirst({
    where: {
      slug: params.slug,
      isEvent: true,
      isActive: true,
      archivedAt: null,
    },
  });
  if (!event) notFound();
  const occurrence = await prisma.classOccurrence.findFirst({
    where: { template: { slug: params.slug, isEvent: true }, status: 'SCHEDULED', startAt: { gt: new Date() } },
    include: {
      instructor: { select: { name: true } },
      _count: { select: { bookings: { where: { status: 'CONFIRMED' } }, waitlistEntries: { where: { status: 'WAITING' } } } },
    },
    orderBy: { startAt: 'asc' },
  });
  const booked = occurrence
    ? occurrence._count.bookings + occurrence.historicalSignupCount
    : 0;
  const capacity = occurrence?.capacity ?? event.defaultCapacity;
  const waiting = occurrence?._count.waitlistEntries ?? 0;
  const soldOut = booked >= capacity;
  const waitlistFull = waiting >= WAITLIST_CAPACITY;
  const bookingLabel = publicBookingCountLabel(booked, capacity);
  const eventPrice = `$${((event.dropInPriceCents || 0) / 100).toFixed(0)}`;
  const eventDate = occurrence
    ? occurrence.startAt.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Date to be announced';
  const eventTime = occurrence
    ? occurrence.startAt.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Time to be announced';
  const instructorName = occurrence?.substituteInstructorName ||
    occurrence?.instructor?.name ||
    'Instructor to be announced';
  const bullets = fallback?.bullets || [
    event.description,
    `${event.durationMinutes}-minute specialty event`,
  ];

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
            Reserve the event and choose specialty pricing or eligible VIP
            access without leaving the Rhyze website.
          </p>

          <div className="mt-10 rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
            <div className="mb-5 inline-flex rounded-2xl border border-rhyze-coral/40 bg-rhyze-coral/10 p-4">
              <Calendar className="h-8 w-8 text-rhyze-coral" aria-hidden />
            </div>
            <h2 className="font-display text-4xl tracking-wider">
              {event.name}
            </h2>
            <div className="mt-3"><NewProgramBadge slug={event.slug} /></div>
            <p className="mt-3 text-rhyze-cream/70">
              {eventDate} · {eventTime} · {event.durationMinutes} min · {instructorName}
            </p>
            <ul className="mt-5 grid gap-2 text-sm text-rhyze-cream/70">
              {bullets.slice(0, 3).map((bullet) => (
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
                {bookingLabel && (
                  <p className="text-sm text-rhyze-cream/60">
                    {bookingLabel}
                    {waiting > 0 ? ` · ${waiting}/${WAITLIST_CAPACITY} waitlist` : ''}
                  </p>
                )}
              </div>
              <span className="font-display text-4xl text-rhyze-gold">
                {eventPrice}
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

          <EventCheckoutButton
            slug={event.slug}
            occurrenceId={occurrence?.id}
            soldOut={soldOut}
            waitlistFull={waitlistFull}
            familyPricing={event.slug === MOMMY_AND_ME_SLUG}
          />
          {occurrence && !soldOut && (
            <Link
              href={`/member/bookings/new?occurrence=${encodeURIComponent(occurrence.id)}`}
              className="focus-ring mt-3 flex min-h-12 w-full items-center justify-center rounded-full border border-rhyze-gold px-5 text-center text-xs font-black uppercase tracking-widest text-rhyze-gold hover:bg-rhyze-gold hover:text-rhyze-black"
            >
              Use VIP access or an event credit
            </Link>
          )}
        </aside>
      </section>
    </main>
  );
}
