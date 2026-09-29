import { FinancialReportView } from '@/components/admin/FinancialReportView';
import { loadFinancialReport, financialReportQuery } from '@/lib/admin/financial-report';
import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@/lib/db/prisma';
import { resolveClassArtwork } from '@/lib/domain/schedule/class-artwork';
import { confirmedRosterBookingWhere } from '@/lib/domain/bookings/known-cancellations';
import { createClassTemplateAction, deleteClassTemplateAction } from '../classes/actions';
import { occurrenceLocalTimeZone } from '@/lib/domain/schedule/occurrence-management';
import { sortCatalogByNextOccurrence } from '@/lib/admin/catalog-order';
import { resolveAnalyticsRange } from '@/lib/admin/analytics-range';
import { occurrenceAdminDateTimeLabel } from '@/lib/domain/schedule/occurrence-display';
import {
  activeEventBookingValueCents,
} from '@/lib/admin/event-revenue';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminEventsPage(
  props: { searchParams: Promise<{ saved?: string; error?: string; range?: string; from?: string; to?: string; page?: string; offering?: string; occurrence?: string }> }
) {
  const searchParams = await props.searchParams;
  const range = resolveAnalyticsRange(searchParams);
  const occurrenceRange = range;
  const report = await loadFinancialReport({ ...searchParams, kind: 'event' });
  const now = new Date();
  const [eventRows, categories, scheduledOccurrences] = await Promise.all([
    prisma.classTemplate.findMany({
      where: { isEvent: true },
      include: {
        occurrences: {
          orderBy: { startAt: 'asc' },
          take: 1,
          include: {
            instructor: { include: { instructorProfile: true } },
            _count: { select: { bookings: { where: confirmedRosterBookingWhere() } } },
          },
        },
        _count: { select: { occurrences: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.classCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.classOccurrence.findMany({
      where: {
        status: 'SCHEDULED',
        startAt: { gte: occurrenceRange.start, lte: occurrenceRange.end },
        template: { isEvent: true },
      },
      include: {
        template: { include: { category: true } },
        instructor: { include: { instructorProfile: true } },
        commerceOrders: {
          where: {
            kind: 'EVENT',
            status: {
              in: [
                'PAID',
                'FULFILLMENT_REVIEW',
                'PARTIALLY_REFUNDED',
                'REFUNDED',
              ],
            },
          },
          select: {
            userId: true,
            customerEmail: true,
            amountCents: true,
            refundedAmountCents: true,
            paidAt: true,
          },
        },
        bookings: {
          where: confirmedRosterBookingWhere(),
          select: {
            userId: true,
            user: { select: { email: true } },
          },
        },
        _count: { select: { bookings: { where: confirmedRosterBookingWhere() } } },
      },
      orderBy: { startAt: 'asc' },
    }),
  ]);
  const events = sortCatalogByNextOccurrence(eventRows);
  const upcomingOccurrences = scheduledOccurrences.filter((occurrence) => occurrence.startAt >= now);
  const pastOccurrences = scheduledOccurrences.filter((occurrence) => occurrence.startAt < now);
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Special experiences</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">EVENTS</h1>
      <p className="mt-3 max-w-2xl text-rhyze-black/55">Events remain part of the public schedule but are managed separately from recurring studio classes.</p>
      <FinancialReportView report={report} basePath="/admin/events" preservedParams={{ kind: 'event' }} />
      {searchParams.saved && <p className="mt-5 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">Event added. Schedule its date and instructor next.</p>}
      <section className="mt-8 border-t-4 border-rhyze-black bg-white p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-rhyze-coral">Scheduled events</p>
            <h2 className="mt-2 font-display text-4xl tracking-wider">ALL EVENTS · {occurrenceRange.label}</h2>
            <p className="mt-1 text-sm font-bold text-rhyze-black/50">Every scheduled event occurrence for the selected day, week, or month.</p>
          </div>
          <EventScheduleRangeControls active={occurrenceRange.key} />
        </div>
        <div className="mt-5 grid gap-6">
          <EventOccurrenceSection title="UPCOMING" occurrences={upcomingOccurrences} reportQuery={financialReportQuery(searchParams)} />
          <EventOccurrenceSection title="PAST" occurrences={pastOccurrences} past reportQuery={financialReportQuery(searchParams)} />
          {!scheduledOccurrences.length && <p className="border border-black/10 p-5 text-sm font-bold text-rhyze-black/50">No scheduled events in this range.</p>}
        </div>
      </section>
      <form action={createClassTemplateAction} className="mt-8 grid gap-4 border-t-4 border-rhyze-gold bg-white p-6 md:grid-cols-2">
        <input type="hidden" name="isEvent" value="on" />
        <Field name="name" label="Event name" />
        <label className="grid gap-2"><Span>Category</Span><select name="categoryId" required className="min-h-12 border px-3">{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <Field name="durationMinutes" label="Duration (minutes)" type="number" value="75" />
        <Field name="defaultCapacity" label="Capacity" type="number" value="25" />
        <Field name="dropInPrice" label="Event price" type="number" value="30" />
        <Field name="imageUrl" label="Image path / URL" required={false} />
        <label className="grid gap-2"><Span>Upload photo</Span><input name="image" type="file" accept="image/jpeg,image/png" className="min-h-12 border bg-rhyze-orange/10 p-3" /></label>
        <label className="grid gap-2 md:col-span-2"><Span>Description</Span><textarea name="description" required className="min-h-28 border p-3" /></label>
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">Add event</button>
      </form>
      <div className="mt-8 grid gap-3">
        {events.map((event) => {
          const occurrence = event.occurrences[0];
          const signups = occurrence ? occurrence._count.bookings + occurrence.historicalSignupCount : 0;
          return (
          <article key={event.id} className="grid gap-3 border-l-4 border-rhyze-gold bg-white p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div className="grid gap-4 sm:grid-cols-[3.5rem_1fr] sm:items-center">
                <Image
                  src={resolveClassArtwork({ ...occurrence, template: event })}
                  alt=""
                  width={56}
                  height={56}
                  unoptimized={resolveClassArtwork({ ...occurrence, template: event }).startsWith('/api/media/')}
                  className="h-14 w-14 object-cover"
                />
              <div>
              <h2 className="font-display text-3xl tracking-wider">{event.name}</h2>
              <p className="mt-2 text-sm">${((event.dropInPriceCents || 0) / 100).toFixed(2)} · {event.durationMinutes} minutes · {event._count.occurrences} dates · {signups} signups</p>
              <p className="mt-2 text-xs font-black uppercase text-rhyze-coral">{occurrence ? occurrence.startAt.toLocaleString('en-US', { timeZone: occurrenceLocalTimeZone(), dateStyle: 'medium', timeStyle: 'short' }) : 'Date not scheduled'}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {occurrence && (
                <Link href={`/admin/schedule/${occurrence.id}/roster`} className="border border-rhyze-orange px-3 py-2 text-xs font-black uppercase text-rhyze-coral">Attendees</Link>
              )}
              <Link href={`/admin/classes/${event.id}`} className="border border-rhyze-orange px-3 py-2 text-xs font-black uppercase text-rhyze-coral">Edit</Link>
              <Link href="/admin/schedule" className="border border-rhyze-black px-3 py-2 text-xs font-black uppercase">Add date</Link>
              <form action={deleteClassTemplateAction}><input type="hidden" name="id" value={event.id} /><button className="border border-rhyze-coral px-3 py-2 text-xs font-black uppercase text-rhyze-coral">Delete</button></form>
            </div>
          </article>
        )})}
      </div>
    </>
  );
}
function EventScheduleRangeControls({ active }: { active: string }) {
  const periods = [
    { key: 'day', label: 'Daily' },
    { key: 'week', label: 'Weekly' },
    { key: 'month', label: 'Monthly' },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {periods.map((period) => (
        <Link key={period.key} href={`/admin/events?range=${period.key}`} className={`px-4 py-2 text-xs font-black uppercase tracking-widest ${active === period.key ? 'bg-rhyze-black text-white' : 'border border-rhyze-black bg-white'}`}>
          {period.label}
        </Link>
      ))}
    </div>
  );
}
function EventOccurrenceSection({ title, occurrences, past = false, reportQuery }: { reportQuery: string; title: string; occurrences: Array<{ id: string; startAt: Date; timezone: string; capacity: number; historicalSignupCount: number; template: { name: string; category: { name: string } }; instructor: { name: string | null } | null; commerceOrders: Array<{ userId: string | null; customerEmail: string | null; amountCents: number; refundedAmountCents: number; paidAt: Date | null }>; bookings: Array<{ userId: string; user: { email: string } }>; _count: { bookings: number } }>; past?: boolean }) {
  if (!occurrences.length) return null;
  return (
    <section>
      <h3 className="text-xs font-black uppercase tracking-[0.25em] text-rhyze-black/45">{title}</h3>
      <div className="mt-3 grid gap-3">
        {occurrences.map((occurrence) => {
          const activeBookingValue = activeEventBookingValueCents({
            bookings: occurrence.bookings.map((booking) => ({
              userId: booking.userId,
              email: booking.user.email,
            })),
            orders: occurrence.commerceOrders,
          });
          return (
            <article key={occurrence.id} className={`grid gap-3 border border-black/10 p-4 md:grid-cols-[1fr_auto] md:items-center ${past ? 'bg-rhyze-black/5' : 'bg-white'}`}>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">{occurrenceAdminDateTimeLabel(occurrence)} · {occurrence.template.category.name}</p>
                <h3 className="mt-1 font-display text-3xl tracking-wider">{occurrence.template.name}</h3>
                <p className="mt-1 text-sm text-rhyze-black/55">{occurrence.instructor?.name || 'TBA'} · {occurrence._count.bookings + occurrence.historicalSignupCount}/{occurrence.capacity} signups · Active booking value: ${(activeBookingValue / 100).toFixed(0)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/payments?${reportQuery}&occurrence=${occurrence.id}`} className="border border-rhyze-coral px-4 py-2 text-xs font-black uppercase tracking-widest">Financial entries</Link>
                <Link href={`/admin/schedule/${occurrence.id}`} className="border border-rhyze-black px-4 py-2 text-xs font-black uppercase tracking-widest">Manage</Link>
                <Link href={`/admin/schedule/${occurrence.id}`} className="border border-rhyze-black px-4 py-2 text-xs font-black uppercase tracking-widest">Duplicate / choose date</Link>
                <Link href={`/admin/schedule/${occurrence.id}/roster`} className="border border-rhyze-orange px-4 py-2 text-xs font-black uppercase tracking-widest text-rhyze-coral">Attendees</Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
function Span({ children }: { children: React.ReactNode }) { return <span className="text-xs font-black uppercase tracking-widest">{children}</span>; }
function Field({ name, label, type = 'text', value, required = true }: { name: string; label: string; type?: string; value?: string; required?: boolean }) { return <label className="grid gap-2"><Span>{label}</Span><input name={name} type={type} defaultValue={value} required={required} className="min-h-12 border px-3" /></label>; }
