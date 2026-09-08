import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export type AdminCalendarView = 'day' | 'week' | 'month';

export type AdminCalendarOccurrence = {
  id: string;
  dateKey: string;
  dayLabel: string;
  shortDay: string;
  dateLabel: string;
  timeLabel: string;
  duration: string;
  className: string;
  category: string;
  instructor: string;
  photo: string | null;
  capacity: number;
  booked: number;
  attended: number;
  attendanceUnmarked: number;
  isPast: boolean;
  waitlist: number;
  status: string;
  cancellationReason: string | null;
};

type Props = {
  occurrences: AdminCalendarOccurrence[];
  view: AdminCalendarView;
  selectedDateKey: string;
};

const viewOptions: Array<{ id: AdminCalendarView; label: string }> = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function shiftDate(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shiftMonth(dateKey: string, months: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months, 1);
  return date.toISOString().slice(0, 10);
}

function startOfWeek(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return shiftDate(dateKey, -daysSinceMonday);
}

function formatDateKey(
  dateKey: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Date(`${dateKey}T12:00:00.000Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    ...options,
  });
}

function formatClassCount(count: number) {
  return `${count} ${count === 1 ? 'class' : 'classes'}`;
}

function calendarNotice(dateKey: string) {
  return dateKey === '2026-09-07' ? 'LABOR DAY!' : null;
}

function calendarHref(view: AdminCalendarView, dateKey: string) {
  return `/admin/classes?range=${view}&date=${dateKey}#scheduled-classes`;
}

function buildMonthDays(
  occurrences: AdminCalendarOccurrence[],
  selectedDateKey: string,
) {
  const [year, month] = selectedDateKey.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return [
    ...Array.from({ length: firstWeekday }, (_, index) => ({
      key: `blank-${index}`,
      dateKey: null,
      dayNumber: null,
      occurrences: [] as AdminCalendarOccurrence[],
    })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const dayNumber = index + 1;
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
      return {
        key: dateKey,
        dateKey,
        dayNumber,
        occurrences: occurrences.filter(
          (occurrence) => occurrence.dateKey === dateKey,
        ),
      };
    }),
  ];
}

export function AdminClassesCalendar({
  occurrences,
  view,
  selectedDateKey,
}: Props) {
  const weekStart = startOfWeek(selectedDateKey);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const dateKey = shiftDate(weekStart, index);
    return {
      dateKey,
      day: formatDateKey(dateKey, { weekday: 'long' }),
      shortDay: formatDateKey(dateKey, { weekday: 'short' }),
      dateLabel: formatDateKey(dateKey, { month: 'short', day: 'numeric' }),
      occurrences: occurrences.filter(
        (occurrence) => occurrence.dateKey === dateKey,
      ),
    };
  });
  const selectedOccurrences = occurrences.filter(
    (occurrence) => occurrence.dateKey === selectedDateKey,
  );
  const monthDays = buildMonthDays(occurrences, selectedDateKey);
  const monthLabel = formatDateKey(selectedDateKey, {
    month: 'long',
    year: 'numeric',
  });
  const previousDate =
    view === 'month'
      ? shiftMonth(selectedDateKey, -1)
      : shiftDate(selectedDateKey, -7);
  const nextDate =
    view === 'month'
      ? shiftMonth(selectedDateKey, 1)
      : shiftDate(selectedDateKey, 7);
  const periodLabel = view === 'month' ? 'month' : 'week';

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-rhyze-black p-4 text-rhyze-cream shadow-2xl shadow-black/30 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={calendarHref(view, previousDate)}
            aria-label={`Previous ${periodLabel}`}
            className="focus-ring grid h-11 w-11 place-items-center rounded-full border border-rhyze-gold/45 text-rhyze-gold transition hover:bg-rhyze-coral/15"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Link>
          <Link
            href={calendarHref(view, nextDate)}
            aria-label={`Next ${periodLabel}`}
            className="focus-ring grid h-11 w-11 place-items-center rounded-full border border-rhyze-gold/45 text-rhyze-gold transition hover:bg-rhyze-coral/15"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Link>
        </div>
        <div className="grid grid-cols-3 rounded-full border border-white/10 bg-rhyze-charcoal/80 p-1">
          {viewOptions.map((option) => (
            <Link
              key={option.id}
              href={calendarHref(option.id, selectedDateKey)}
              aria-current={view === option.id ? 'page' : undefined}
              className={cn(
                'focus-ring rounded-full px-3 py-2 text-center text-[0.65rem] font-black uppercase tracking-widest transition sm:px-5 sm:text-xs',
                view === option.id
                  ? 'bg-rhyze-gradient text-rhyze-black shadow-glow'
                  : 'text-rhyze-cream/55 hover:bg-rhyze-coral/15 hover:text-rhyze-cream',
              )}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      {view === 'day' && (
        <>
          <div
            className="no-scrollbar mb-6 grid auto-cols-[minmax(7.5rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-2 xl:grid-cols-7 xl:grid-flow-row xl:overflow-visible"
            aria-label="Choose a day this week"
          >
            {weekDays.map((day) => (
              <Link
                key={day.dateKey}
                href={calendarHref('day', day.dateKey)}
                aria-current={
                  day.dateKey === selectedDateKey ? 'date' : undefined
                }
                className={cn(
                  'focus-ring min-h-24 rounded-xl border px-3 py-3 text-left transition',
                  day.dateKey === selectedDateKey
                    ? 'border-rhyze-gold bg-rhyze-gradient text-rhyze-black shadow-glow'
                    : 'border-white/10 bg-rhyze-charcoal/75 text-rhyze-cream hover:border-rhyze-orange hover:bg-rhyze-coral/15',
                )}
              >
                <span className="block text-xs font-black uppercase tracking-widest">
                  <span className="xl:hidden">{day.shortDay}</span>
                  <span className="hidden xl:inline">{day.day}</span>
                </span>
                <span className="mt-1 block font-display text-2xl tracking-wide">
                  {day.dateLabel}
                </span>
                <span
                  className={cn(
                    'mt-1 block text-[0.65rem] font-black uppercase tracking-widest',
                    day.dateKey === selectedDateKey
                      ? 'text-rhyze-black/60'
                      : 'text-rhyze-cream/40',
                  )}
                >
                  {formatClassCount(day.occurrences.length)}
                </span>
              </Link>
            ))}
          </div>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-2 px-1">
            <h3 className="text-sm font-black uppercase tracking-[0.25em] text-rhyze-gold">
              {formatDateKey(selectedDateKey, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </h3>
            <p className="text-xs font-bold uppercase tracking-widest text-rhyze-cream/45">
              Admin schedule controls
            </p>
          </div>
          {calendarNotice(selectedDateKey) && (
            <div className="mb-4 rounded-xl border-2 border-rhyze-gold bg-rhyze-gold px-4 py-3 text-center font-black uppercase tracking-[0.2em] text-rhyze-black shadow-glow">
              {calendarNotice(selectedDateKey)}
            </div>
          )}
          <div className="space-y-3 rounded-[1.25rem] border border-rhyze-gold/20 bg-gradient-to-br from-rhyze-coral/20 via-rhyze-orange/10 to-rhyze-gold/20 p-3 md:p-5">
            {selectedOccurrences.length ? (
              selectedOccurrences.map((occurrence) => (
                <AdminClassCard key={occurrence.id} occurrence={occurrence} />
              ))
            ) : (
              <EmptySchedule />
            )}
          </div>
        </>
      )}

      {view === 'week' && (
        <div>
          <div className="mb-5 px-1">
            <p className="text-sm font-black uppercase tracking-[0.25em] text-rhyze-gold">
              Weekly agenda
            </p>
            <h3 className="mt-2 font-display text-4xl tracking-wider md:text-5xl">
              {weekDays[0].dateLabel} – {weekDays[6].dateLabel}
            </h3>
          </div>
          <div className="space-y-3">
            {weekDays.map((day) => (
              <section
                key={day.dateKey}
                className="rounded-xl border border-rhyze-gold/35 bg-rhyze-charcoal/75 p-3 shadow-[0_0_0_1px_rgba(255,199,44,0.2)] md:p-4"
              >
                <Link
                  href={calendarHref('day', day.dateKey)}
                  className="focus-ring mb-3 block border-b border-white/10 pb-3"
                >
                  <p className="text-xs font-black uppercase tracking-widest text-rhyze-gold">
                    {day.dateLabel}
                  </p>
                  <h3 className="font-display text-3xl tracking-wider">
                    {day.day}
                  </h3>
                  {calendarNotice(day.dateKey) && (
                    <span className="mt-2 inline-flex rounded-md bg-rhyze-gold px-2 py-1 text-[0.65rem] font-black uppercase tracking-widest text-rhyze-black">
                      {calendarNotice(day.dateKey)}
                    </span>
                  )}
                  <span className="mt-1 block text-xs font-black uppercase tracking-widest text-rhyze-cream/45">
                    {formatClassCount(day.occurrences.length)}
                  </span>
                </Link>
                <div className="grid gap-2">
                  {day.occurrences.length ? (
                    day.occurrences.map((occurrence) => (
                      <AdminClassCard
                        key={occurrence.id}
                        occurrence={occurrence}
                        compact
                      />
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed border-white/10 bg-rhyze-black/40 p-4 text-sm font-bold text-rhyze-cream/35">
                      No classes scheduled
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {view === 'month' && (
        <div>
          <div className="mb-5 px-1">
            <p className="text-sm font-black uppercase tracking-[0.25em] text-rhyze-gold">
              Monthly calendar
            </p>
            <h3 className="mt-2 font-display text-4xl tracking-wider md:text-5xl">
              {monthLabel}
            </h3>
            <p className="mt-2 text-sm text-rhyze-cream/55">
              Select any date—including a past date—to open its complete class
              records.
            </p>
          </div>
          <div className="overflow-x-auto pb-2">
            <div
              aria-label="Monthly calendar"
              className="min-w-[46rem] rounded-xl border border-rhyze-gold/30 bg-rhyze-charcoal/75 p-4 shadow-[0_0_0_1px_rgba(255,199,44,0.25)]"
            >
              <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[0.65rem] font-black uppercase tracking-widest text-rhyze-gold">
                {weekdayLabels.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {monthDays.map((day) => {
                  if (!day.dayNumber || !day.dateKey) {
                    return (
                      <span
                        key={day.key}
                        aria-hidden
                        className="min-h-28"
                      />
                    );
                  }
                  return (
                    <Link
                      key={day.key}
                      href={calendarHref('day', day.dateKey)}
                      aria-label={`Open ${formatDateKey(day.dateKey, {
                        month: 'long',
                        day: 'numeric',
                      })}`}
                      className={cn(
                        'focus-ring min-h-28 rounded-lg border p-3 text-left transition',
                        day.occurrences.length
                          ? 'border-rhyze-gold/40 bg-rhyze-black hover:border-rhyze-orange hover:bg-rhyze-coral/15'
                          : 'border-white/5 bg-rhyze-black/30 text-rhyze-cream/25 hover:border-white/15',
                      )}
                    >
                      <span
                        className={cn(
                          'font-black',
                          day.occurrences.length && 'text-rhyze-cream',
                        )}
                      >
                        {day.dayNumber}
                      </span>
                      {calendarNotice(day.dateKey) && (
                        <span className="mt-1 block rounded-sm bg-rhyze-gold px-1 py-0.5 text-[0.6rem] font-black uppercase tracking-wide text-rhyze-black">
                          {calendarNotice(day.dateKey)}
                        </span>
                      )}
                      {!!day.occurrences.length && (
                        <div className="mt-2 text-xs font-black uppercase tracking-wider text-rhyze-gold">
                          <p>{formatClassCount(day.occurrences.length)}</p>
                          <p className="mt-1 truncate text-rhyze-cream/55">
                            {day.occurrences[0].className}
                          </p>
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminClassCard({
  occurrence,
  compact = false,
}: {
  occurrence: AdminCalendarOccurrence;
  compact?: boolean;
}) {
  const isCancelled = occurrence.status === 'CANCELLED';
  const canCancel = occurrence.status === 'SCHEDULED';

  return (
    <article
      className={cn(
        'grid gap-4 rounded-xl border bg-rhyze-black p-4 shadow-[0_0_0_1px_rgba(255,199,44,0.3)] md:items-center',
        compact
          ? 'md:grid-cols-[4rem_minmax(0,1fr)_auto]'
          : 'md:grid-cols-[5rem_minmax(0,1fr)_auto] md:p-5',
        isCancelled
          ? 'border-rhyze-coral/70'
          : 'border-rhyze-gold/40 hover:border-rhyze-orange',
      )}
    >
      <div>
        <p className="text-base font-black leading-none text-rhyze-cream">
          {occurrence.timeLabel}
        </p>
        <p className="mt-2 text-xs font-semibold text-rhyze-cream/60">
          {occurrence.duration}
        </p>
      </div>
      <div className="flex min-w-0 items-center gap-4">
        {occurrence.photo ? (
          <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-rhyze-cream/70 bg-rhyze-charcoal">
            <Image
              src={occurrence.photo}
              alt=""
              fill
              sizes="48px"
              unoptimized={occurrence.photo.startsWith('/api/media/')}
              className="object-cover object-[center_18%]"
            />
          </span>
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-rhyze-cream/50 bg-rhyze-charcoal font-display text-2xl text-rhyze-gold">
            {occurrence.instructor.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <p className="mb-1 text-xs font-black uppercase tracking-[0.2em] text-rhyze-orange">
            {occurrence.category}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h4
              className={cn(
                'font-display font-black uppercase leading-tight tracking-wide text-rhyze-cream',
                compact ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl',
              )}
            >
              {occurrence.className}
            </h4>
            {isCancelled && (
              <span className="rounded-full bg-rhyze-coral px-2 py-1 text-[0.6rem] font-black uppercase tracking-widest text-white">
                Class canceled
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm font-semibold text-rhyze-cream/65">
            <span>{occurrence.instructor}</span>
            <span aria-hidden>·</span>
            <span>
              {occurrence.booked}/{occurrence.capacity} signups
            </span>
            {occurrence.isPast && (
              <>
                <span aria-hidden>·</span>
                <span className="text-emerald-300">
                  {occurrence.attended} attended
                </span>
                {occurrence.attendanceUnmarked > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="text-rhyze-gold">
                      {occurrence.attendanceUnmarked} attendance unmarked
                    </span>
                  </>
                )}
              </>
            )}
            {occurrence.waitlist > 0 && (
              <>
                <span aria-hidden>·</span>
                <span>{occurrence.waitlist} waitlist</span>
              </>
            )}
          </div>
          {isCancelled && occurrence.cancellationReason && (
            <p className="mt-2 text-xs font-bold text-rhyze-coral">
              Cancellation reason: {occurrence.cancellationReason}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 md:max-w-60 md:justify-end">
        <Link
          href={`/admin/schedule/${occurrence.id}`}
          className="focus-ring rounded-lg bg-rhyze-gradient px-4 py-2 text-center text-[0.65rem] font-black uppercase tracking-widest text-rhyze-black"
        >
          Manage
        </Link>
        {canCancel && (
          <Link
            href={`/admin/schedule/${occurrence.id}?cancel=1`}
            className="focus-ring rounded-lg border border-rhyze-coral px-4 py-2 text-center text-[0.65rem] font-black uppercase tracking-widest text-rhyze-coral transition hover:bg-rhyze-coral hover:text-white"
          >
            Cancel class
          </Link>
        )}
        <Link
          href={`/admin/schedule/${occurrence.id}/roster`}
          className="focus-ring rounded-lg border border-rhyze-gold/70 px-4 py-2 text-center text-[0.65rem] font-black uppercase tracking-widest text-rhyze-gold transition hover:bg-rhyze-gold hover:text-rhyze-black"
        >
          Attendees
        </Link>
      </div>
    </article>
  );
}

function EmptySchedule() {
  return (
    <div className="rounded-xl bg-rhyze-black p-8 text-center">
      <h4 className="font-display text-3xl tracking-wider text-rhyze-cream">
        No classes scheduled
      </h4>
      <p className="mt-2 text-sm text-rhyze-cream/50">
        Select another day or use the arrows to move through the calendar.
      </p>
    </div>
  );
}
