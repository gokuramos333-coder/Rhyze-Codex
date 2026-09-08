import { prisma } from '@/lib/db/prisma';
import {
  archiveClassTemplateAction,
  createClassTemplateAction,
  deleteClassTemplateAction,
} from './actions';
import Link from 'next/link';
import Image from 'next/image';
import {
  DistributionBars,
  RevenueAreaChart,
} from '@/components/admin/AnalyticsCharts';
import {
  buildDailyRevenueSeries,
  recordsInRange,
  summarizeRevenue,
} from '@/lib/admin/dashboard-analytics';
import { sortCatalogByNextOccurrence } from '@/lib/admin/catalog-order';
import { AnalyticsRangeControls } from '@/components/admin/AnalyticsRangeControls';
import { resolveAnalyticsRange } from '@/lib/admin/analytics-range';
import { resolveScheduleOccurrenceRange } from '@/lib/admin/schedule-occurrence-range';
import { assignableInstructorWhere, dedupeAssignableInstructors, instructorOptionLabel } from '@/lib/admin/assignable-instructors';
import {
  AdminClassesCalendar,
  type AdminCalendarOccurrence,
} from '@/components/admin/AdminClassesCalendar';
import { localDateKey } from '@/lib/domain/schedule/public-calendar';
import {
  occurrenceInstructorName,
  occurrenceTitle,
  occurrenceTitleWithInstructor,
} from '@/lib/domain/schedule/occurrence-management';

export default async function AdminClassesPage(
  props: {
    searchParams: Promise<{ saved?: string; error?: string; range?: string; date?: string; from?: string; to?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const now = new Date();
  const range = resolveAnalyticsRange(searchParams);
  const occurrenceRange = resolveScheduleOccurrenceRange(searchParams, now, 'day');
  const occurrenceQueryRange = occurrenceRange.key === 'day'
    ? resolveScheduleOccurrenceRange(
        { range: 'week', date: occurrenceRange.dateKey },
        now,
        'week',
      )
    : occurrenceRange;
  const [templateRows, categories, instructors, sombleRevenue, nativeRevenue, activeClients, scheduledOccurrences] = await Promise.all([
    prisma.classTemplate.findMany({
      where: { isEvent: false },
      include: {
        category: true,
        _count: { select: { occurrences: true } },
        occurrences: {
          where: { status: 'SCHEDULED' },
          orderBy: { startAt: 'asc' },
          take: 1,
          include: {
            instructor: { include: { instructorProfile: true } },
            _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
          },
        },
      },
      orderBy: [{ archivedAt: 'asc' }, { name: 'asc' }],
    }),
    prisma.classCategory.findMany({ orderBy: { name: 'asc' } }),
    prisma.user.findMany({
      where: assignableInstructorWhere,
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
    prisma.sombleTransaction.findMany({
      where: { contentType: 'Live Class' },
      select: {
        amountCents: true,
        transferredAt: true,
        userId: true,
        contentType: true,
      },
    }),
    prisma.purchase.findMany({
      where: { status: 'PAID', product: { kind: 'DROP_IN' } },
      select: {
        amountCents: true,
        refundedAmountCents: true,
        paidAt: true,
        createdAt: true,
        userId: true,
        product: { select: { name: true } },
      },
    }),
    prisma.booking.findMany({
      where: {
        status: { in: ['CONFIRMED', 'ATTENDED'] },
        occurrence: { template: { isEvent: false } },
      },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.classOccurrence.findMany({
      where: {
        startAt: { gte: occurrenceQueryRange.start, lt: occurrenceQueryRange.end },
        template: { isEvent: false },
      },
      include: {
        template: { include: { category: true } },
        instructor: { include: { instructorProfile: true } },
        bookings: {
          where: { status: { not: 'CANCELLED' } },
          select: {
            status: true,
            attendance: { select: { status: true } },
          },
        },
        _count: {
          select: {
            waitlistEntries: { where: { status: 'WAITING' } },
          },
        },
      },
      orderBy: { startAt: 'asc' },
    }),
  ]);
  const templates = sortCatalogByNextOccurrence(templateRows);
  const assignableInstructors = dedupeAssignableInstructors(instructors);
  const allRevenueRecords = [
    ...sombleRevenue.map((item) => ({
      amountCents: item.amountCents,
      occurredAt: item.transferredAt,
      customerId: item.userId,
      type: item.contentType,
      source: 'SOMBLE' as const,
    })),
    ...nativeRevenue.map((item) => ({
      amountCents: item.amountCents - item.refundedAmountCents,
      occurredAt: item.paidAt || item.createdAt,
      customerId: item.userId,
      type: item.product.name,
      source: 'RHYZE' as const,
    })),
  ];
  const revenueRecords = recordsInRange(allRevenueRecords, range.start, range.end);
  const summary = summarizeRevenue(revenueRecords);
  const series = buildDailyRevenueSeries(revenueRecords, range.start, range.end);
  const adminCalendarOccurrences: AdminCalendarOccurrence[] =
    scheduledOccurrences.map((occurrence) => {
      const timezone = occurrence.timezone || 'America/New_York';
      const instructor = occurrenceInstructorName(occurrence);
      return {
        id: occurrence.id,
        dateKey: localDateKey(occurrence.startAt, timezone),
        dayLabel: occurrence.startAt.toLocaleDateString('en-US', {
          timeZone: timezone,
          weekday: 'long',
        }),
        shortDay: occurrence.startAt.toLocaleDateString('en-US', {
          timeZone: timezone,
          weekday: 'short',
        }),
        dateLabel: occurrence.startAt.toLocaleDateString('en-US', {
          timeZone: timezone,
          month: 'short',
          day: 'numeric',
        }),
        timeLabel: occurrence.startAt.toLocaleTimeString('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          minute: '2-digit',
        }),
        duration: `${occurrence.template.durationMinutes} min`,
        className: occurrenceTitleWithInstructor(
          occurrenceTitle(occurrence),
          instructor,
        ),
        category: occurrence.template.category.name,
        instructor,
        photo: occurrence.instructor?.instructorProfile?.photoUrl || null,
        capacity: occurrence.capacity,
        booked: occurrence.bookings.length + occurrence.historicalSignupCount,
        attended: occurrence.bookings.filter(
          (booking) =>
            booking.status === 'ATTENDED' ||
            booking.attendance?.status === 'CHECKED_IN' ||
            booking.attendance?.status === 'ATTENDED',
        ).length,
        attendanceUnmarked:
          occurrence.bookings.filter(
            (booking) =>
              booking.status === 'CONFIRMED' && !booking.attendance,
          ).length + occurrence.historicalSignupCount,
        isPast: occurrence.endAt <= now,
        waitlist: occurrence._count.waitlistEntries,
        status: occurrence.status,
        cancellationReason: occurrence.cancellationReason,
      };
    });

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        Catalog
      </p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">
        CLASS TEMPLATES
      </h1>
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <Metric label={`Class revenue · ${range.label}`} value={`$${(summary.totalCents / 100).toFixed(0)}`} href="/admin/payments" />
        <Metric label="Active class clients" value={`${activeClients.length}`} href="/admin/members" />
        <Metric label="Class templates" value={`${templates.length}`} href="/admin/classes" />
      </div>
      <AnalyticsRangeControls basePath="/admin/classes" active={range.key} from={searchParams.from} to={searchParams.to} />
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.5fr_.9fr]">
        <RevenueAreaChart
          title={`Class revenue · ${range.label}`}
          points={series.map((point) => ({
            label: point.label,
            value: point.amountCents,
          }))}
        />
        <DistributionBars
          title="Class revenue sources"
          href="/admin/classes"
          items={Object.entries(summary.byType).map(([label, value]) => ({
            label,
            value,
          }))}
        />
      </div>
      {searchParams.saved && <Notice text="Class template saved." />}
      {searchParams.error && <Notice text={searchParams.error === 'history' ? 'This class has history and cannot be deleted. Archive it instead.' : 'Check the class details.'} error />}

      <section
        id="scheduled-classes"
        className="mt-8 scroll-mt-8 rounded-[2rem] border border-rhyze-black/10 bg-rhyze-charcoal p-4 shadow-2xl md:p-6"
      >
        <div className="mb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-rhyze-gold">
              Scheduled classes
            </p>
            <h2 className="mt-2 font-display text-4xl tracking-wider text-rhyze-cream md:text-5xl">
              SCHEDULED CLASSES
            </h2>
            <p className="mt-1 text-sm font-bold text-rhyze-cream/50">
              Browse every saved class by day, week, or month—including past dates.
            </p>
            <p className="mt-3 rounded-xl border border-rhyze-coral/40 bg-rhyze-coral/10 p-3 text-sm font-bold text-rhyze-cream/70">
              low attendance cancellation rule: if a class has 0 signups 2 hours before class start, use Cancel class to review the reason, approve the email, and close the occurrence so no one can sign up.
            </p>
          </div>
        </div>
        <AdminClassesCalendar
          occurrences={adminCalendarOccurrences}
          view={occurrenceRange.key}
          selectedDateKey={occurrenceRange.dateKey}
        />
      </section>

      <section
        id="create-a-class"
        className="mt-8 scroll-mt-8 border-t-4 border-rhyze-coral bg-white p-6"
      >
        <p className="text-xs font-black uppercase tracking-[0.25em] text-rhyze-coral">
          Class template
        </p>
        <h2 className="mt-2 font-display text-4xl tracking-wider">
          CREATE A CLASS
        </h2>
        <form
          action={createClassTemplateAction}
          className="mt-5 grid gap-4 md:grid-cols-2"
        >
          <Input name="name" label="Class name" />
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-widest">Instructor</span>
          <select name="instructorId" required className="min-h-12 border px-3">
            <option value="">Select instructor</option>
            {assignableInstructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>{instructorOptionLabel(instructor)}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-widest">Category</span>
          <select name="categoryId" required className="min-h-12 border px-3">
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <Input name="durationMinutes" label="Duration (minutes)" type="number" value="50" />
        <Input name="defaultCapacity" label="Default capacity" type="number" value="25" />
        <Input
          name="dropInPrice"
          label="Single-class price"
          type="number"
          value="25"
          min="1"
          step="0.01"
        />
        <Input name="startAt" label="First class date and time" type="datetime-local" />
        <label className="flex min-h-12 items-center gap-3 border bg-rhyze-orange/10 px-4 text-sm font-bold">
          <input name="repeatWeekly" type="checkbox" />
          Repeat weekly on the same day and time
        </label>
        <Input name="repeatWeeks" label="Number of weeks" type="number" value="8" required={false} />
        <Input name="imageUrl" label="Image path / URL" required={false} />
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-widest">Upload photo</span>
          <input name="image" type="file" accept="image/jpeg,image/png" className="min-h-12 border bg-rhyze-orange/10 p-3" />
        </label>
        <label className="grid gap-2 md:col-span-2">
          <span className="text-xs font-black uppercase tracking-widest">Description</span>
          <textarea name="description" required className="min-h-28 border p-3" />
        </label>
          <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">
            Add class template
          </button>
        </form>
      </section>

      <section
        id="edit-a-class"
        className="mt-8 scroll-mt-8 border-t-4 border-rhyze-gold bg-white p-6"
      >
        <p className="text-xs font-black uppercase tracking-[0.25em] text-rhyze-coral">
          Class templates
        </p>
        <h2 className="mt-2 font-display text-4xl tracking-wider">
          EDIT A CLASS
        </h2>
        <div className="mt-5 grid gap-3">
          {templates.map((template) => (
          <article key={template.id} className="grid gap-3 bg-white p-5 md:grid-cols-[1fr_auto] md:items-center">
            <div className="grid gap-4 sm:grid-cols-[3.5rem_1fr] sm:items-center">
              {template.occurrences[0]?.instructor?.instructorProfile?.photoUrl ? (
                <Image
                  src={template.occurrences[0].instructor.instructorProfile.photoUrl}
                  alt=""
                  width={56}
                  height={56}
                  unoptimized={template.occurrences[0].instructor.instructorProfile.photoUrl.startsWith('/api/media/')}
                  className="h-14 w-14 object-cover"
                />
              ) : (
                <span className="grid h-14 w-14 place-items-center bg-rhyze-orange/10 font-display text-2xl">
                  {(template.occurrences[0]?.instructor?.name || 'T').slice(0, 1)}
                </span>
              )}
              <div>
              <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">
                {template.category.name} · {template.durationMinutes} min
              </p>
              <h2 className="mt-1 font-display text-3xl tracking-wider">{template.name}</h2>
              <p className="mt-1 text-sm text-rhyze-black/55">
                {template._count.occurrences} scheduled · {template.defaultCapacity} spots ·
                {' '}${((template.dropInPriceCents || 0) / 100).toFixed(0)}
              </p>
              <p className="mt-2 text-xs font-bold uppercase tracking-widest text-rhyze-black/45">
                {template.occurrences[0] ? `Next: ${template.occurrences[0].startAt.toLocaleString('en-US', { timeZone: template.occurrences[0].timezone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'No upcoming date'}
                {template.occurrences[0] ? ` · ${template.occurrences[0]._count.bookings + template.occurrences[0].historicalSignupCount} signups` : ''}
              </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {template.occurrences[0] && (
                <>
                  <Link href={`/admin/schedule/${template.occurrences[0].id}`} className="border border-rhyze-black px-4 py-2 text-xs font-black uppercase tracking-widest">Manage next class</Link>
                  <Link href={`/admin/schedule/${template.occurrences[0].id}?cancel=1`} className="border border-rhyze-coral px-4 py-2 text-xs font-black uppercase tracking-widest text-rhyze-coral">Cancel next class</Link>
                  <Link href={`/admin/schedule/${template.occurrences[0].id}/roster`} className="border border-rhyze-orange px-4 py-2 text-xs font-black uppercase tracking-widest text-rhyze-coral">Attendees</Link>
                </>
              )}
              <Link href={`/admin/classes/${template.id}`} className="border border-rhyze-black px-4 py-2 text-xs font-black uppercase tracking-widest">Edit template</Link>
              {template.isActive ? (
                <form action={archiveClassTemplateAction}>
                <input type="hidden" name="id" value={template.id} />
                <button className="border border-rhyze-coral px-4 py-2 text-xs font-black uppercase tracking-widest text-rhyze-coral">
                  Archive
                </button>
                </form>
              ) : <span className="self-center text-xs font-black uppercase tracking-widest text-rhyze-black/35">Archived</span>}
              <form action={deleteClassTemplateAction}>
                <input type="hidden" name="id" value={template.id} />
                <button className="border border-rhyze-coral px-4 py-2 text-xs font-black uppercase tracking-widest text-rhyze-coral">Delete</button>
              </form>
            </div>
          </article>
          ))}
        </div>
      </section>
    </>
  );
}

function Metric({ label, value, href }: { label: string; value: string; href: string }) {
  return <Link href={href} className="border-t-4 border-rhyze-orange bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg"><p className="text-xs font-black uppercase text-rhyze-black/45">{label}</p><p className="mt-2 font-display text-5xl">{value}</p></Link>;
}

function Input({ name, label, type = 'text', value, required = true, min, step }: { name: string; label: string; type?: string; value?: string; required?: boolean; min?: string; step?: string }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-widest">{label}</span>
      <input name={name} type={type} required={required} defaultValue={value} min={min} step={step} className="min-h-12 border px-3" />
    </label>
  );
}

function Notice({ text, error = false }: { text: string; error?: boolean }) {
  return <p className={`mt-5 border-l-4 p-4 text-sm font-bold ${error ? 'border-rhyze-coral bg-rhyze-coral/10' : 'border-emerald-600 bg-emerald-50'}`}>{text}</p>;
}
