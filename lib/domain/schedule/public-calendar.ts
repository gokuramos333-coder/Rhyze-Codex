import { expandWeeklyRecurrence } from './recurrence-service';

export const PUBLIC_SCHEDULE_TIMEZONE = 'America/New_York';

export type PublicCalendarSlot = {
  id: string;
  dateKey: string;
  dayLabel: string;
  shortDay: string;
  dateLabel: string;
  timeLabel: string;
  templateSlug?: string;
  className: string;
  category: string;
  instructor: string;
  photo: string;
  room: string;
  duration: string;
  capacity: number;
  booked: number;
  waitlist: number;
  price: string;
  bookingHref: string;
};

export type MonthlyCalendarDay = {
  key: string;
  dateKey: string | null;
  dayNumber: number | null;
  slots: PublicCalendarSlot[];
};

export type PublicScheduleFilterSource = {
  instructor: { id: string; name: string | null } | null;
  category: { name: string; slug: string };
};

export function buildPublicScheduleFilterOptions(
  rows: PublicScheduleFilterSource[],
) {
  const instructors = new Map<string, { id: string; name: string }>();
  const categories = new Map<string, { name: string; slug: string }>();

  for (const row of rows) {
    if (row.instructor?.name) {
      instructors.set(row.instructor.id, {
        id: row.instructor.id,
        name: row.instructor.name,
      });
    }
    categories.set(row.category.slug, row.category);
  }

  return {
    instructors: [...instructors.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    categories: [...categories.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  };
}

export function publicScheduleDetailHref(occurrenceId: string) {
  return `/schedule/${occurrenceId}`;
}

export function localDateKey(
  date = new Date(),
  timezone = PUBLIC_SCHEDULE_TIMEZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function timeZoneOffsetMs(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || '0');
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour') % 24,
    value('minute'),
    value('second'),
  );
  return asUtc - date.getTime();
}

export function startOfLocalDateUtc(
  dateKey = localDateKey(),
  timezone = PUBLIC_SCHEDULE_TIMEZONE,
): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const naiveUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  return new Date(naiveUtc.getTime() - timeZoneOffsetMs(naiveUtc, timezone));
}

export function newClassStartDates(
  startLocal: string,
  repeatWeekly: boolean,
  repeatWeeks: number,
  timezone = PUBLIC_SCHEDULE_TIMEZONE,
): Date[] {
  return expandWeeklyRecurrence({
    startLocal,
    timezone,
    intervalWeeks: 1,
    count: repeatWeekly ? Math.min(52, Math.max(2, repeatWeeks)) : 1,
  });
}

export function buildMonthlyCalendar(
  slots: PublicCalendarSlot[],
  activeDateKey: string,
): MonthlyCalendarDay[] {
  const [year, month] = activeDateKey.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return [
    ...Array.from({ length: firstWeekday }, (_, index) => ({
      key: `blank-${index}`,
      dateKey: null,
      dayNumber: null,
      slots: [],
    })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const dayNumber = index + 1;
      const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(
        dayNumber,
      ).padStart(2, '0')}`;
      return {
        key: dateKey,
        dateKey,
        dayNumber,
        slots: slots.filter((slot) => slot.dateKey === dateKey),
      };
    }),
  ];
}
