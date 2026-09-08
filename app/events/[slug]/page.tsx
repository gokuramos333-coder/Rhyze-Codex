import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, CalendarDays, CheckCircle2 } from 'lucide-react';
import { getOwnedEvent } from '@/lib/rhyze-platform';
import { Button } from '@/components/ui/Button';
import { prisma } from '@/lib/db/prisma';
import { publicBookingCountLabel } from '@/lib/catalog/public-booking-count';
import { occurrenceLocalTimeZone } from '@/lib/domain/schedule/occurrence-management';
import { NewProgramBadge } from '@/components/catalog/NewProgramBadge';

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const params = await props.params;
  const event = await prisma.classTemplate.findFirst({ where: { slug: params.slug, isEvent: true, isActive: true } });
  return event ? { title: event.name, description: event.description } : { title: 'Event not found' };
}

export default async function EventDetailPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const event = await prisma.classTemplate.findFirst({
    where: { slug: params.slug, isEvent: true, isActive: true, archivedAt: null },
    include: {
      occurrences: {
        where: { status: 'SCHEDULED', startAt: { gte: new Date() } },
        include: {
          instructor: true,
          _count: {
            select: {
              bookings: { where: { status: 'CONFIRMED' } },
            },
          },
        },
        orderBy: { startAt: 'asc' },
        take: 1,
      },
    },
  });
  if (!event) notFound();
  const occurrence = event.occurrences[0];
  const fallback = getOwnedEvent(event.slug);
  const bookingLabel = occurrence
    ? publicBookingCountLabel(
        occurrence._count.bookings + occurrence.historicalSignupCount,
        occurrence.capacity,
      )
    : null;
  const details = event.description.split(/\n|(?<=[.!?])\s+/).filter(Boolean).slice(0, 5);

  return (
    <main className="mx-auto max-w-6xl px-6 py-20">
      <Link href="/events" className="focus-ring mb-10 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-rhyze-cream/60 hover:text-rhyze-coral">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All Events
      </Link>
      <section className="grid gap-10 lg:grid-cols-[1fr_0.85fr] lg:items-start">
        <div>
          <p className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.28em] text-rhyze-orange">
            <CalendarDays className="h-4 w-4" aria-hidden />
            {occurrence ? occurrence.startAt.toLocaleString('en-US', { timeZone: occurrenceLocalTimeZone(), weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Date and time coming soon'}
          </p>
          <NewProgramBadge slug={event.slug} />
          <h1 className="font-display text-6xl leading-none tracking-wider md:text-8xl">{event.name.toUpperCase()}</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-rhyze-cream/75">{event.description}</p>
          <ul className="mt-8 grid gap-3 text-sm font-bold text-rhyze-cream/80">
            {(fallback?.bullets || details).map((bullet) => (
              <li key={bullet} className="flex gap-3 border-l-2 border-rhyze-gold bg-rhyze-charcoal/70 p-4">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-rhyze-gold" aria-hidden /><span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
        <aside className="overflow-hidden rounded-3xl border border-rhyze-gold/25 bg-rhyze-charcoal">
          <div className="relative aspect-[4/3] bg-rhyze-black">
            <Image src={event.imageUrl || fallback?.photo || '/brand/rhyze-logo-header.png'} alt={event.name} fill sizes="(min-width: 1024px) 28rem, 100vw" className="object-cover object-[center_18%]" />
          </div>
          <dl className="divide-y divide-white/10 p-6 text-sm">
            <EventDetail label="Instructor" value={occurrence?.instructor?.name || 'To be announced'} />
            <EventDetail label="Price" value={`$${((event.dropInPriceCents || 0) / 100).toFixed(2)}`} />
            <EventDetail label="Duration" value={`${event.durationMinutes} minutes`} />
            {bookingLabel && <EventDetail label="Booked" value={bookingLabel.replace(' booked', '')} />}
          </dl>
          <div className="px-6 pb-6">
            <Button href={occurrence ? `/book/event/${event.slug}` : '/events'} size="lg" className="w-full">Claim Your Spot</Button>
          </div>
        </aside>
      </section>
    </main>
  );
}

function EventDetail({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 py-3"><dt className="text-xs font-black uppercase tracking-wide text-rhyze-cream/45">{label}</dt><dd className="text-right font-black text-rhyze-cream">{value}</dd></div>;
}
