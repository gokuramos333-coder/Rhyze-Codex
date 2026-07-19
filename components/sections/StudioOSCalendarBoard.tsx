'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ownedSchedule, weekDays } from '@/lib/rhyze-platform';

type CalendarView = 'daily' | 'weekly' | 'monthly';

const viewOptions: { id: CalendarView; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

export function StudioOSCalendarBoard() {
  const [view, setView] = useState<CalendarView>('weekly');
  const [selectedDay, setSelectedDay] = useState('Mon');

  const scheduleByDay = useMemo(() => {
    return weekDays.map((day) => {
      const slots = ownedSchedule.filter((slot) => slot.day === day.shortDay);
      const booked = slots.reduce((total, slot) => total + slot.booked, 0);
      const capacity = slots.reduce((total, slot) => total + slot.capacity, 0);

      return { ...day, slots, booked, capacity };
    });
  }, []);

  const selectedDaySchedule =
    scheduleByDay.find((day) => day.shortDay === selectedDay) ?? scheduleByDay[1];
  const totalBooked = ownedSchedule.reduce((total, slot) => total + slot.booked, 0);
  const totalCapacity = ownedSchedule.reduce((total, slot) => total + slot.capacity, 0);

  return (
    <div className="border border-white/10 bg-rhyze-charcoal/75 p-4 shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.28em] text-rhyze-orange">
            Total booked so far
          </p>
          <strong className="mt-2 block font-display text-5xl leading-none tracking-wider">
            {totalBooked}/{totalCapacity}
          </strong>
          <span className="mt-2 block text-xs font-bold text-rhyze-cream/50">
            Across this Rhyze schedule board
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 border border-white/10 bg-rhyze-black/45 p-1">
          {viewOptions.map((option) => (
            <button
              type="button"
              key={option.id}
              data-calendar-view={option.id}
              onClick={() => setView(option.id)}
              className={[
                'focus-ring px-4 py-2 text-xs font-black uppercase tracking-widest transition',
                view === option.id
                  ? 'bg-rhyze-gradient text-rhyze-black'
                  : 'text-rhyze-cream/55 hover:bg-white/10 hover:text-rhyze-cream',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'daily' && (
        <div className="mt-4 grid gap-4 xl:grid-cols-[13rem_minmax(0,1fr)]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-1">
            {scheduleByDay.map((day) => (
              <button
                type="button"
                key={day.id}
                onClick={() => setSelectedDay(day.shortDay)}
                className={[
                  'focus-ring border px-3 py-3 text-left transition',
                  selectedDay === day.shortDay
                    ? 'border-rhyze-gold/50 bg-rhyze-gold/10'
                    : 'border-white/10 bg-rhyze-black/35 hover:border-rhyze-coral/40',
                ].join(' ')}
              >
                <span className="block text-xs font-black uppercase tracking-widest text-rhyze-gold">
                  {day.date}
                </span>
                <strong className="mt-1 block text-sm">{day.day}</strong>
                <span className="mt-1 block text-xs font-bold text-rhyze-cream/45">
                  {day.slots.length} classes
                </span>
              </button>
            ))}
          </div>

          <section className="border border-white/10 bg-rhyze-black/35 p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-rhyze-orange">
                  Daily view
                </p>
                <h3 className="mt-2 font-display text-4xl tracking-wider">
                  {selectedDaySchedule.label}
                </h3>
              </div>
              <span className="text-sm font-black text-rhyze-gold">
                {selectedDaySchedule.booked}/{selectedDaySchedule.capacity} booked
              </span>
            </div>
            <div className="grid gap-3">
              {selectedDaySchedule.slots.map((slot) => (
                <ScheduleClassCard key={slot.id} slot={slot} />
              ))}
              {selectedDaySchedule.slots.length === 0 && (
                <p className="border border-white/10 bg-rhyze-charcoal/60 p-4 text-sm font-bold text-rhyze-cream/55">
                  No classes scheduled for this day yet.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {view === 'weekly' && (
        <div className="mt-4 grid gap-3 lg:grid-cols-7">
          {scheduleByDay.map((day) => (
            <section
              key={day.id}
              className={[
                'min-h-72 border bg-rhyze-black/35 p-3',
                day.shortDay === 'Mon'
                  ? 'border-rhyze-gold/50 shadow-[inset_0_3px_0_rgba(255,199,44,0.85)]'
                  : 'border-white/10',
              ].join(' ')}
            >
              <div className="mb-3 border-b border-white/10 pb-3">
                <p className="text-xs font-black uppercase tracking-widest text-rhyze-gold">
                  {day.date}
                </p>
                <h3 className="font-display text-3xl tracking-wider">{day.day}</h3>
                <span className="mt-1 block text-xs font-bold text-rhyze-cream/45">
                  {day.booked}/{day.capacity || 0} booked
                </span>
              </div>
              <div className="grid gap-2">
                {day.slots.map((slot) => (
                  <ScheduleClassCard key={slot.id} slot={slot} compact />
                ))}
                {day.slots.length === 0 && (
                  <p className="border border-dashed border-white/10 p-3 text-xs font-bold text-rhyze-cream/35">
                    No classes
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {view === 'monthly' && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {scheduleByDay.map((day) => (
            <button
              type="button"
              key={day.id}
              onClick={() => {
                setSelectedDay(day.shortDay);
                setView('daily');
              }}
              className="focus-ring border border-white/10 bg-rhyze-black/35 p-4 text-left transition hover:border-rhyze-gold/40 hover:bg-rhyze-black/55"
            >
              <span className="text-xs font-black uppercase tracking-widest text-rhyze-gold">
                {day.date}
              </span>
              <h3 className="mt-2 font-display text-4xl tracking-wider">{day.day}</h3>
              <div className="mt-4 grid gap-2 text-sm font-bold text-rhyze-cream/65">
                <span>{day.slots.length} classes</span>
                <span>{day.booked}/{day.capacity || 0} booked</span>
                <span>{day.slots.reduce((total, slot) => total + slot.waitlist, 0)} waitlist</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleClassCard({
  slot,
  compact = false,
}: {
  slot: (typeof ownedSchedule)[number];
  compact?: boolean;
}) {
  const booked = slot.booked;

  return (
    <article
      data-studio-detail="calendar"
      className={[
        'cursor-pointer border border-white/10 bg-rhyze-charcoal/70 transition hover:border-rhyze-gold/40',
        compact ? 'p-3' : 'p-4',
      ].join(' ')}
    >
      <div className={compact ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-[3.5rem_1fr_auto] sm:items-center'}>
        <div className="relative h-14 w-14 overflow-hidden rounded-full border border-white/20 bg-rhyze-black">
          <Image
            src={slot.photo}
            alt={slot.instructor}
            fill
            sizes="56px"
            className="object-cover object-[center_18%]"
          />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-rhyze-gold">
            {slot.time}
          </p>
          <h4 className={compact ? 'mt-1 text-sm font-black' : 'mt-1 font-display text-3xl tracking-wider'}>
            {slot.className}
          </h4>
          <p className="mt-1 text-xs font-bold text-rhyze-cream/50">
            {slot.instructor} - {slot.duration} - {slot.room}
          </p>
        </div>
        <div className={compact ? 'grid gap-2' : 'text-right'}>
          <p className="text-sm font-black text-rhyze-gold">
            {booked}/{slot.capacity} booked
          </p>
          {slot.waitlist > 0 && (
            <p className="mt-1 text-xs font-black uppercase tracking-wide text-rhyze-coral">
              {slot.waitlist} waitlist
            </p>
          )}
        </div>
      </div>
      {!compact && (
        <Link
          href={slot.bookingHref}
          className="focus-ring mt-4 inline-flex bg-rhyze-gradient px-4 py-2 text-xs font-black uppercase tracking-widest text-rhyze-black"
        >
          Open Booking Flow
        </Link>
      )}
    </article>
  );
}
