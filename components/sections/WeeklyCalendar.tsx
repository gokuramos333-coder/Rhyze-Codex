'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { WAITLIST_CAPACITY } from '@/lib/domain/bookings/booking-rules';
import {
  buildMonthlyCalendar,
  type PublicCalendarSlot,
} from '@/lib/domain/schedule/public-calendar';
import { publicBookingCountLabel } from '@/lib/catalog/public-booking-count';
import { NewProgramBadge } from '@/components/catalog/NewProgramBadge';

type Props = {
  slots: PublicCalendarSlot[];
  compact?: boolean;
  initialDateKey?: string;
  initialView?: CalendarView;
};

type CalendarView = 'daily' | 'weekly' | 'monthly';

const viewOptions: { id: CalendarView; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function calendarNotice(dateKey: string) {
  return dateKey === '2026-09-07' ? 'LABOR DAY!' : null;
}

function shiftDate(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function startOfWeek(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  return shiftDate(dateKey, -daysSinceMonday);
}

function formatDateKey(
  dateKey: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    ...options,
  });
}

function formatClassCount(count: number) {
  return `${count} ${count === 1 ? 'class' : 'classes'}`;
}

export function WeeklyCalendar({
  slots,
  compact = false,
  initialDateKey,
  initialView = 'daily',
}: Props) {
  const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(initialDateKey || '')
    ? initialDateKey!
    : slots[0]?.dateKey || new Date().toISOString().slice(0, 10);
  const [view, setView] = useState<CalendarView>(initialView);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const daySlots = useMemo(
    () => slots.filter((slot) => slot.dateKey === selectedDate),
    [selectedDate, slots],
  );
  const weekStart = startOfWeek(selectedDate);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const dateKey = shiftDate(weekStart, index);
        return {
          dateKey,
          day: formatDateKey(dateKey, { weekday: 'long' }),
          shortDay: formatDateKey(dateKey, { weekday: 'short' }),
          dateLabel: formatDateKey(dateKey, { month: 'short', day: 'numeric' }),
          slots: slots.filter((slot) => slot.dateKey === dateKey),
        };
      }),
    [slots, weekStart],
  );
  const monthlyCalendarDays = useMemo(
    () => buildMonthlyCalendar(slots, selectedDate),
    [selectedDate, slots],
  );
  const monthLabel = formatDateKey(selectedDate, {
    month: 'long',
    year: 'numeric',
  });

  const moveMonth = (direction: -1 | 1) => {
    const date = new Date(`${selectedDate}T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + direction, 1);
    setSelectedDate(date.toISOString().slice(0, 10));
  };

  return (
    <div className="rounded-[1.75rem] border border-white/10 bg-rhyze-black/80 p-4 shadow-2xl shadow-black/30 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={view === 'monthly' ? 'Previous month' : 'Previous week'}
            onClick={() =>
              view === 'monthly'
                ? moveMonth(-1)
                : setSelectedDate(shiftDate(selectedDate, -7))
            }
            className="focus-ring grid h-10 w-10 place-items-center rounded-full border border-rhyze-gold/35 text-rhyze-gold transition hover:bg-rhyze-coral/15"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={view === 'monthly' ? 'Next month' : 'Next week'}
            onClick={() =>
              view === 'monthly'
                ? moveMonth(1)
                : setSelectedDate(shiftDate(selectedDate, 7))
            }
            className="focus-ring grid h-10 w-10 place-items-center rounded-full border border-rhyze-gold/35 text-rhyze-gold transition hover:bg-rhyze-coral/15"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </div>
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
          <div
            className="no-scrollbar mb-6 grid auto-cols-[minmax(7.5rem,1fr)] grid-flow-col gap-2 overflow-x-auto pb-2 md:grid-cols-7 md:grid-flow-row md:overflow-visible"
            aria-label="Choose a day this week"
          >
            {weekDays.map((day) => (
              <button
                type="button"
                key={day.dateKey}
                data-week-date={day.dateKey}
                aria-pressed={selectedDate === day.dateKey}
                onClick={() => setSelectedDate(day.dateKey)}
                className={cn(
                  'focus-ring min-h-20 rounded-xl border px-3 py-3 text-left transition',
                  selectedDate === day.dateKey
                    ? 'border-rhyze-gold bg-rhyze-gradient text-rhyze-black shadow-glow'
                    : 'border-white/10 bg-rhyze-charcoal/75 text-rhyze-cream hover:border-rhyze-orange hover:bg-rhyze-coral/15',
                )}
              >
                <span className="block text-xs font-black uppercase tracking-widest">
                  <span className="md:hidden">{day.shortDay}</span>
                  <span className="hidden md:inline">{day.day}</span>
                </span>
                <span className="mt-1 block font-display text-2xl tracking-wide">
                  {day.dateLabel}
                </span>
                <span
                  className={cn(
                    'mt-1 block text-[0.65rem] font-black uppercase tracking-widest',
                    selectedDate === day.dateKey
                      ? 'text-rhyze-black/60'
                      : 'text-rhyze-cream/40',
                  )}
                >
                  {formatClassCount(day.slots.length)}
                </span>
              </button>
            ))}
          </div>
          <div className="mb-5 flex flex-col gap-2 px-1 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-rhyze-gold">
                {formatDateKey(selectedDate, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
            <p className="text-sm text-rhyze-cream/55">
              Rhyze-owned booking · credits · waitlist
            </p>
          </div>
          {calendarNotice(selectedDate) && (
            <div className="mb-4 rounded-xl border-2 border-rhyze-gold bg-rhyze-gold px-4 py-3 text-center font-black uppercase tracking-[0.2em] text-rhyze-black shadow-glow">
              {calendarNotice(selectedDate)}
            </div>
          )}
          <div className={cn(
            'space-y-3 rounded-[1.25rem] border border-rhyze-gold/20 bg-gradient-to-br from-rhyze-coral/20 via-rhyze-orange/10 to-rhyze-gold/20 p-3 md:p-5',
            compact && 'md:p-4',
          )}>
            {daySlots.length ? daySlots.map((slot) => (
              <CustomerScheduleCard key={slot.id} slot={slot} compact={compact} />
            )) : (
              <div className="rounded-xl bg-rhyze-black p-8 text-center">
                <h4 className="font-display text-3xl tracking-wider">No Classes Bookable</h4>
                <p className="mt-2 text-sm text-rhyze-cream/60">Use the arrows to find the next class day.</p>
              </div>
            )}
          </div>
        </>
      )}

      {view === 'weekly' && (
        <div>
          <div className="mb-5 px-1">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-rhyze-gold">Weekly agenda</p>
            <h3 className="mt-2 font-display text-3xl tracking-wider md:text-5xl">
              {weekDays[0].dateLabel} – {weekDays[6].dateLabel}
            </h3>
          </div>
          <div className="space-y-3">
            {weekDays.map((day) => (
              <section key={day.dateKey} className="rounded-xl border border-rhyze-gold/35 bg-rhyze-charcoal/75 p-3 shadow-[0_0_0_1px_rgba(255,199,44,0.35)] md:p-4">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(day.dateKey);
                    setView('daily');
                  }}
                  className="focus-ring mb-3 w-full border-b border-white/10 pb-3 text-left"
                >
                  <p className="text-xs font-black uppercase tracking-widest text-rhyze-gold">{day.dateLabel}</p>
                  <h3 className="font-display text-3xl tracking-wider">{day.day}</h3>
                  {calendarNotice(day.dateKey) && (
                    <span className="mt-2 inline-flex rounded-md bg-rhyze-gold px-2 py-1 text-[0.65rem] font-black uppercase tracking-widest text-rhyze-black">
                      {calendarNotice(day.dateKey)}
                    </span>
                  )}
                  <span className="text-xs font-black uppercase tracking-widest text-rhyze-cream/55">{formatClassCount(day.slots.length)}</span>
                </button>
                <div className="grid gap-2">
                  {day.slots.map((slot) => <CustomerScheduleCard key={slot.id} slot={slot} compact={compact} />)}
                  {!day.slots.length && <p className="rounded-lg border border-dashed border-white/10 bg-rhyze-black/40 p-4 text-sm font-bold text-rhyze-cream/40">No Classes Bookable</p>}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {view === 'monthly' && (
        <div>
          <div className="mb-5 px-1">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-rhyze-gold">Monthly calendar</p>
            <h3 className="mt-2 font-display text-3xl tracking-wider md:text-5xl">{monthLabel}</h3>
            <p className="mt-2 text-sm text-rhyze-cream/55">Every scheduled class in the month appears on its actual date.</p>
          </div>
          <div aria-label="Monthly calendar" className="rounded-xl border border-rhyze-gold/30 bg-rhyze-charcoal/75 p-3 shadow-[0_0_0_1px_rgba(255,199,44,0.35)] md:p-4">
            <div className="mb-2 grid grid-cols-7 gap-2 text-center text-[0.65rem] font-black uppercase tracking-widest text-rhyze-gold">
              {weekdayLabels.map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1 md:gap-2">
              {monthlyCalendarDays.map((day) => {
                if (!day.dayNumber || !day.dateKey) return <span key={day.key} aria-hidden className="min-h-16 md:min-h-28" />;
                return (
                  <button
                    type="button"
                    key={day.key}
                    onClick={() => {
                      setSelectedDate(day.dateKey!);
                      setView('daily');
                    }}
                    className={cn(
                      'focus-ring min-h-16 rounded-lg border p-1.5 text-left transition md:min-h-28 md:p-3',
                      day.slots.length
                        ? 'border-rhyze-gold/35 bg-rhyze-black hover:border-rhyze-orange hover:bg-rhyze-coral/15'
                        : 'border-white/5 bg-rhyze-black/30 text-rhyze-cream/25',
                    )}
                  >
                    <span className={cn('font-black', day.slots.length && 'text-rhyze-cream')}>{day.dayNumber}</span>
                    {calendarNotice(day.dateKey) && (
                      <span className="mt-1 block rounded-sm bg-rhyze-gold px-1 py-0.5 text-[0.45rem] font-black uppercase tracking-wide text-rhyze-black md:text-[0.65rem]">
                        {calendarNotice(day.dateKey)}
                      </span>
                    )}
                    {!!day.slots.length && (
                      <div className="mt-2 text-[0.55rem] font-black uppercase tracking-wider text-rhyze-gold md:text-xs">
                        <p>{formatClassCount(day.slots.length)}</p>
                        <p className="mt-1 hidden truncate text-rhyze-cream/55 md:block">{day.slots[0].className}</p>
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
  slot: PublicCalendarSlot;
  compact?: boolean;
}) {
  const full = slot.booked >= slot.capacity;
  const bookingLabel = publicBookingCountLabel(slot.booked, slot.capacity);

  return (
    <article className={cn(
      'grid gap-4 rounded-xl border border-rhyze-gold/40 bg-rhyze-black p-4 shadow-[0_0_0_1px_rgba(255,199,44,0.35)] transition hover:border-rhyze-orange hover:bg-rhyze-coral/15 md:items-center',
      compact ? 'grid-cols-1 p-3 md:grid-cols-[3.5rem_minmax(0,1fr)_auto]' : 'md:grid-cols-[4.5rem_1fr_auto] md:p-5',
    )}>
      <div className="text-rhyze-cream">
        <p className="text-base font-black leading-none">{slot.timeLabel}</p>
        {!compact && <p className="mt-2 text-xs font-semibold text-rhyze-cream/70">{slot.duration}</p>}
      </div>
      <div className="flex min-w-0 items-center gap-4">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-rhyze-cream/70 bg-rhyze-charcoal">
          <Image src={slot.photo} alt={slot.instructor} fill sizes="48px" className="object-cover object-[center_18%]" />
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs font-black uppercase tracking-[0.2em] text-rhyze-orange">
            {slot.category}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h4
              className={cn(
                'font-display font-black uppercase leading-tight tracking-wide text-rhyze-cream',
                compact ? 'text-xl md:text-2xl' : 'text-2xl md:text-3xl',
              )}
            >
              {slot.className}
            </h4>
            {slot.isEvent && (
              <span className="rounded-full border border-rhyze-gold/60 bg-rhyze-gold/15 px-2 py-1 text-[0.55rem] font-black uppercase tracking-widest text-rhyze-gold">
                SPECIAL EVENT
              </span>
            )}
            {calendarNotice(slot.dateKey) && (
              <span className="rounded-md bg-rhyze-gold px-2 py-1 text-[0.6rem] font-black uppercase tracking-widest text-rhyze-black shadow-glow">
                {calendarNotice(slot.dateKey)}
              </span>
            )}
            {slot.templateSlug && <NewProgramBadge slug={slot.templateSlug} />}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-rhyze-cream/70">
            <span>{[slot.instructor, ...(compact ? [slot.duration] : []), slot.price].join(' · ')}</span>
            {slot.isSubstitute && (
              <span className="rounded-sm bg-rhyze-coral px-1.5 py-0.5 text-[0.55rem] font-black uppercase tracking-widest text-white">
                SUB
              </span>
            )}
          </p>
          {bookingLabel && (
            <p className="mt-1 text-xs uppercase tracking-widest text-rhyze-gold">
              {bookingLabel}{full && slot.waitlist ? ` · ${slot.waitlist} waitlist` : ''}
            </p>
          )}
        </div>
      </div>
      {full && slot.waitlist >= WAITLIST_CAPACITY ? (
        <span className={cn(
          'inline-flex cursor-not-allowed items-center justify-center rounded-lg border border-white/20 bg-white/10 font-black uppercase tracking-wider text-rhyze-cream/45',
          compact ? 'w-full px-3 py-3 text-[0.7rem] md:w-auto md:py-2' : 'px-5 py-3 text-sm',
        )}>WAITLIST FULL</span>
      ) : (
        <Link
          href={slot.bookingHref}
          className={cn(
            'focus-ring inline-flex items-center justify-center rounded-lg bg-rhyze-gradient font-black uppercase tracking-wider text-rhyze-black transition hover:shadow-glow',
            compact ? 'w-full px-3 py-3 text-[0.7rem] md:w-auto md:py-2' : 'px-5 py-3 text-sm',
          )}
        >{full ? 'JOIN WAITLIST' : 'BOOK'}</Link>
      )}
    </article>
  );
}
