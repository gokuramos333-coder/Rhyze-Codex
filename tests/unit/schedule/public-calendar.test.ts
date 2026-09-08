import { describe, expect, it } from 'vitest';
import {
  buildPublicScheduleFilterOptions,
  buildMonthlyCalendar,
  localDateKey,
  newClassStartDates,
  publicScheduleDetailHref,
  type PublicCalendarSlot,
} from '@/lib/domain/schedule/public-calendar';

const slot = (id: string, dateKey: string): PublicCalendarSlot => ({
  id,
  dateKey,
  dayLabel: 'Tuesday',
  shortDay: 'Tue',
  dateLabel: 'Aug 4',
  timeLabel: '8:00 AM',
  className: 'Yoga with Mackenzie',
  category: 'Yoga & Pilates',
  instructor: 'Mackenzie Heffernan',
  photo: '/founders/instructor-mackenzie-heffernan.jpg',
  isEvent: false,
  isSubstitute: false,
  room: 'Main Floor',
  duration: '50 min',
  capacity: 25,
  booked: 0,
  waitlist: 0,
  price: '$25',
  bookingHref: `/schedule/${id}`,
});

describe('public schedule calendar', () => {
  it('keeps every recurring class in its actual month date', () => {
    const calendar = buildMonthlyCalendar(
      [
        slot('first', '2026-08-04'),
        slot('second', '2026-08-11'),
        slot('third', '2026-08-25'),
      ],
      '2026-08-04',
    );

    expect(calendar.find((day) => day.dateKey === '2026-08-04')?.slots).toHaveLength(1);
    expect(calendar.find((day) => day.dateKey === '2026-08-11')?.slots).toHaveLength(1);
    expect(calendar.find((day) => day.dateKey === '2026-08-25')?.slots).toHaveLength(1);
    expect(calendar.filter((day) => day.dayNumber !== null)).toHaveLength(31);
  });

  it('creates either one date or the requested weekly series', () => {
    expect(newClassStartDates('2026-08-03T10:00', false, 8)).toHaveLength(1);
    expect(newClassStartDates('2026-08-03T10:00', true, 8)).toHaveLength(8);
  });

  it('formats occurrence dates in the studio timezone', () => {
    expect(
      localDateKey(
        new Date('2026-08-05T02:00:00.000Z'),
        'America/New_York',
      ),
    ).toBe('2026-08-04');
  });

  it('routes standard classes and events to their rich detail experiences', () => {
    expect(
      publicScheduleDetailHref({
        occurrenceId: 'class-1',
        templateSlug: 'rhyze-up-vanessa',
        isEvent: false,
      }),
    ).toBe('/book/rhyze-up-vanessa?occurrence=class-1');
    expect(
      publicScheduleDetailHref({
        occurrenceId: 'event-1',
        templateSlug: 'tcj-hip-hop-happy-hour-tricia',
        isEvent: true,
      }),
    ).toBe('/events/tcj-hip-hop-happy-hour-tricia');
  });

  it('builds filters from assigned classes without excluding owner-instructors', () => {
    const options = buildPublicScheduleFilterOptions([
      {
        instructor: { id: 'melissa', name: 'Melissa Llanos' },
        category: { name: 'Dance', slug: 'dance' },
      },
      {
        instructor: { id: 'melissa', name: 'Melissa Llanos' },
        category: { name: 'Dance', slug: 'dance' },
      },
      {
        instructor: { id: 'mackenzie', name: 'Mackenzie Heffernan' },
        category: { name: 'Yoga & Pilates', slug: 'yoga' },
      },
      {
        instructor: null,
        category: { name: 'Strength & HIIT', slug: 'strength' },
      },
    ]);

    expect(options.instructors).toEqual([
      { id: 'mackenzie', name: 'Mackenzie Heffernan' },
      { id: 'melissa', name: 'Melissa Llanos' },
    ]);
    expect(options.categories).toEqual([
      { name: 'Dance', slug: 'dance' },
      { name: 'Strength & HIIT', slug: 'strength' },
      { name: 'Yoga & Pilates', slug: 'yoga' },
    ]);
  });
});
