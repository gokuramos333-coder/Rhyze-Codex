'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ownedSchedule, weekDays } from '@/lib/rhyze-platform';
import { cn } from '@/lib/cn';

type Props = {
  compact?: boolean;
};

type CalendarView = 'daily' | 'weekly' | 'monthly';

const viewOptions: { id: CalendarView; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

const calendarYear = 2026;
const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatClassCount(count: number) {
  return `${count} ${count === 1 ? 'class' : 'classes'}`;
}

export function WeeklyCalendar({ compact = false }: Props) {
  const [view, setView] = useState<CalendarView>('daily');
  const [selectedDay, setSelectedDay] = useState('Mon');
  const selectedIndex = weekDays.findIndex(
    (day) => day.shortDay === selectedDay,
  );
  const activeDay = weekDays[selectedIndex] ?? weekDays[1];
  const weeklyDaySummaries = useMemo(() => {
    return weekDays.map((day) => {
      const slots = ownedSchedule.filter((slot) => slot.day === day.shortDay);
      const booked = slots.reduce((total, slot) => total + slot.booked, 0);
      const capacity = slots.reduce((total, slot) => total + slot.capacity, 0);
      const waitlist = slots.reduce((total, slot) => total + slot.waitlist, 0);

      return { ...day, slots, booked, capacity, waitlist };
    });
  }, []);
  const daySlots = useMemo(
    () => ownedSchedule.filter((slot) => slot.day === activeDay.shortDay),
    [activeDay.shortDay],
  );
  const monthlyCalendarDays = useMemo(() => {
    const [monthName] = activeDay.date.split(' ');
    const monthIndex = monthNames.indexOf(monthName);
    const daysInMonth = new Date(calendarYear, monthIndex + 1, 0).getDate();
    const firstWeekday = new Date(calendarYear, monthIndex, 1).getDay();

    return [
      ...Array.from({ length: firstWeekday }, (_, index) => ({
        key: `blank-${index}`,
        dayNumber: null,
        summary: null,
      })),
      ...Array.from({ length: daysInMonth }, (_, index) => {
        const dayNumber = index + 1;
        const date = `${monthName} ${dayNumber}`;
        const summary =
          weeklyDaySummaries.find((day) => day.date === date) ?? null;

        return {
          key: date,
          dayNumber,
          summary,
        };
      }),
    ];
  }, [activeDay.date, weeklyDaySummaries]);
  const [monthName] = activeDay.date.split(' ');
  const monthLabel = `${monthName} ${calendarYear}`;
  const moveDay = (direction: -1 | 1) => {
    const nextIndex = Math.min(
      Math.max(selectedIndex + direction, 0),
      weekDays.length - 1,
    );
    setSelectedDay(weekDays[nextIndex].shortDay);
  };

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-rhyze-black/80 p-4 shadow-2xl shadow-black/30 md:p-6">
      <div className="mb-6 flex justify-end">
        <div className="grid grid-cols-3 gap-2 rounded-full border border-white/10 bg-rhyze-charcoal/70 p-1">
          {viewOptions.map((option) => (
            <button
              type="button"
              key={option.id}
              data-calendar-view={option.id}
              onClick={() => setView(option.id)}
              className={cn(
                'focus-ring rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest transition',
                view === option.id
                  ? 'bg-rhyze-gradient text-rhyze-black'
                  : 'text-rhyze-cream/60 hover:bg-rhyze-coral/15 hover:text-rhyze-cream',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'daily' && (
        <>
          <div className="mb-6 flex items-center gap-3">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => moveDay(-1)}
              className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rhyze-cream text-rhyze-black transition hover:bg-rhyze-orange disabled:opacity-40"
              disabled={selectedIndex <= 0}
            >
              <ChevronLeft className="h-6 w-6" aria-hidden />
            </button>

            <div className="no-scrollbar grid flex-1 grid-flow-col grid-cols-none gap-2 overflow-x-auto md:grid-flow-row md:grid-cols-7">
              {weekDays.map((day) => {
                const isActive = day.shortDay === activeDay.shortDay;
                const hasClasses = ownedSchedule.some(
                  (slot) => slot.day === day.shortDay,
                );
                return (
                  <button
                    type="button"
                    key={day.id}
                    onClick={() => setSelectedDay(day.shortDay)}
                    className={cn(
                      'focus-ring min-w-32 border-b-2 px-3 pb-4 pt-1 text-center transition md:min-w-0',
                      isActive
                        ? 'border-rhyze-orange bg-rhyze-coral/15 text-rhyze-cream'
                        : 'border-transparent text-rhyze-cream hover:bg-rhyze-coral/15 hover:text-rhyze-gold',
                    )}
                  >
                    <span className="block text-xs font-bold uppercase tracking-[0.2em]">
                      {day.date}
                      {hasClasses && (
                        <span
                          className="ml-1 text-rhyze-gold"
                          aria-label="classes available"
                        >
                          •
                        </span>
                      )}
                    </span>
                    <span className="mt-2 block text-lg font-black md:text-xl">
                      {day.day}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              aria-label="Next day"
              onClick={() => moveDay(1)}
              className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-full bg-rhyze-cream text-rhyze-black transition hover:bg-rhyze-orange disabled:opacity-40"
              disabled={selectedIndex >= weekDays.length - 1}
            >
              <ChevronRight className="h-6 w-6" aria-hidden />
            </button>
          </div>

          <div className="mb-5 flex flex-col gap-2 px-1 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-rhyze-gold">
                {activeDay.label}
              </p>
              <h3 className="mt-2 font-display text-3xl tracking-wider md:text-5xl">
                {daySlots.length} Classes Bookable
              </h3>
            </div>
            <p className="text-sm text-rhyze-cream/55">
              Rhyze-owned booking · credits · waitlist
            </p>
          </div>

          <div
            className={cn(
              'space-y-3 rounded-[1.25rem] border border-rhyze-gold/20 bg-gradient-to-br from-rhyze-coral/20 via-rhyze-orange/10 to-rhyze-gold/20 p-3 md:p-5',
              compact && 'md:p-4',
            )}
          >
            {daySlots.length > 0 ? (
              daySlots.map((slot) => (
                <CustomerScheduleCard key={slot.id} slot={slot} />
              ))
            ) : (
              <div className="rounded-xl bg-rhyze-black p-8 text-center">
                <h4 className="font-display text-3xl tracking-wider">
                  No Classes Bookable
                </h4>
                <p className="mt-2 text-sm text-rhyze-cream/60">
                  Pick another day to find your next rhythm.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {view === 'weekly' && (
        <div>
          <div className="mb-5 flex flex-col gap-2 px-1 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-rhyze-gold">
                Weekly agenda
              </p>
              <h3 className="mt-2 font-display text-3xl tracking-wider md:text-5xl">
                {weekDays[0].date} - {weekDays[6].date}
              </h3>
            </div>
            <p className="text-sm text-rhyze-cream/55">
              {formatClassCount(ownedSchedule.length)}
            </p>
          </div>

          <div className="space-y-3">
            {weeklyDaySummaries.map((day) => (
              <section
                key={day.id}
                className="rounded-xl border border-rhyze-gold/35 bg-rhyze-charcoal/75 p-3 shadow-[0_0_0_1px_rgba(255,199,44,0.35)] transition hover:border-rhyze-orange hover:bg-rhyze-coral/10 md:p-4"
              >
                <div className="mb-3 flex flex-col gap-2 border-b border-white/10 pb-3 md:flex-row md:items-center md:justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDay(day.shortDay);
                      setView('daily');
                    }}
                    className="focus-ring text-left"
                  >
                    <p className="text-xs font-black uppercase tracking-widest text-rhyze-gold">
                      {day.date}
                    </p>
                    <h3 className="font-display text-3xl tracking-wider">
                      {day.day}
                    </h3>
                  </button>
                  <span className="text-xs font-black uppercase tracking-widest text-rhyze-cream/55">
                    {formatClassCount(day.slots.length)} · {day.booked}/
                    {day.capacity || 0} booked
                  </span>
                </div>
                <div className="grid gap-2">
                  {day.slots.map((slot) => (
                    <CustomerScheduleCard
                      key={slot.id}
                      slot={slot}
                      compact={compact}
                    />
                  ))}
                  {day.slots.length === 0 && (
                    <p className="rounded-lg border border-dashed border-white/10 bg-rhyze-black/40 p-4 text-sm font-bold text-rhyze-cream/40">
                      No Classes Bookable
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {view === 'monthly' && (
        <div>
          <div className="mb-5 flex flex-col gap-2 px-1 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-rhyze-gold">
                Monthly calendar
              </p>
              <h3 className="mt-2 font-display text-3xl tracking-wider md:text-5xl">
                {monthLabel}
              </h3>
            </div>
            <p className="text-sm text-rhyze-cream/55">
              Select a highlighted date to open the daily booking view.
            </p>
          </div>

          <div
            aria-label="Monthly calendar"
            className="rounded-xl border border-rhyze-gold/30 bg-rhyze-charcoal/75 p-3 shadow-[0_0_0_1px_rgba(255,199,44,0.35)] md:p-4"
          >
            <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[0.65rem] font-black uppercase tracking-widest text-rhyze-gold">
              {weekdayLabels.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {monthlyCalendarDays.map((day) => {
                const hasSchedule = Boolean(day.summary);
                const hasClasses = Boolean(day.summary?.slots.length);

                if (!day.dayNumber) {
                  return (
                    <span key={day.key} aria-hidden className="min-h-20" />
                  );
                }

                return (
                  <button
                    type="button"
                    key={day.key}
                    disabled={!hasSchedule}
                    onClick={() => {
                      if (!day.summary) return;
                      setSelectedDay(day.summary.shortDay);
                      setView('daily');
                    }}
                    className={cn(
                      'focus-ring min-h-20 rounded-lg border p-2 text-left transition md:min-h-28 md:p-3',
                      hasSchedule
                        ? 'border-rhyze-gold/35 bg-rhyze-black shadow-[0_0_0_1px_rgba(255,199,44,0.35)] hover:border-rhyze-orange hover:bg-rhyze-coral/15'
                        : 'border-white/5 bg-rhyze-black/30 text-rhyze-cream/25',
                    )}
                  >
                    <span
                      className={cn(
                        'font-black',
                        hasSchedule ? 'text-rhyze-cream' : '',
                      )}
                    >
                      {day.dayNumber}
                    </span>
                    {hasSchedule && (
                      <div className="mt-3 space-y-1 text-[0.65rem] font-black uppercase tracking-wider text-rhyze-cream/60 md:text-xs">
                        <p className={hasClasses ? 'text-rhyze-gold' : ''}>
                          {formatClassCount(day.summary?.slots.length ?? 0)}
                        </p>
                        <p>
                          {day.summary?.booked ?? 0}/
                          {day.summary?.capacity ?? 0} booked
                        </p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerScheduleCard({
  slot,
  compact = false,
}: {
  slot: (typeof ownedSchedule)[number];
  compact?: boolean;
}) {
  const full = slot.booked >= slot.capacity;

  return (
    <article
      className={cn(
        'grid gap-4 rounded-xl border border-rhyze-gold/40 bg-rhyze-black p-4 shadow-[0_0_0_1px_rgba(255,199,44,0.35)] transition hover:border-rhyze-orange hover:bg-rhyze-coral/15 md:items-center',
        compact ? 'p-3' : 'md:grid-cols-[4.5rem_1fr_auto] md:p-5',
      )}
    >
      <div className="text-rhyze-cream">
        <p className="text-base font-black leading-none">{slot.time}</p>
        {!compact && (
          <p className="mt-2 text-xs font-semibold text-rhyze-cream/70">
            {slot.duration}
          </p>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-4">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-rhyze-cream/70 bg-rhyze-charcoal">
          <Image
            src={slot.photo}
            alt={slot.instructor}
            fill
            sizes="48px"
            className="object-cover object-[center_18%]"
          />
        </div>
        <div className="min-w-0">
          <h4
            className={cn(
              'font-display font-black leading-tight tracking-normal text-rhyze-cream',
              compact ? 'text-sm' : 'truncate text-lg md:text-xl',
            )}
          >
            {slot.className}
          </h4>
          <p className="mt-1 text-sm font-semibold text-rhyze-cream/70">
            In-Person · {slot.room} · {slot.price}
          </p>
          <p className="mt-1 text-xs uppercase tracking-widest text-rhyze-gold">
            {slot.booked}/{slot.capacity} booked
            {full && slot.waitlist ? ` · ${slot.waitlist} waitlist` : ''}
          </p>
        </div>
      </div>

      {!compact && (
        <Link
          href={slot.bookingHref}
          className="focus-ring inline-flex items-center justify-center rounded-lg bg-rhyze-gradient px-5 py-3 text-sm font-black text-rhyze-black transition hover:shadow-glow"
        >
          {full ? 'Waitlist' : 'Book'}
        </Link>
      )}
    </article>
  );
}
