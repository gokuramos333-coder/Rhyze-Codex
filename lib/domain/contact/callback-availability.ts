import { STUDIO_TIME_ZONE } from '@/lib/config/studio';
import { zonedLocalDateTimeToDate } from '@/lib/domain/schedule/recurrence-service';
import { site } from '@/lib/site';

export const CALLBACK_MINUTES = 15;
export const CALLBACK_BUFFER_MINUTES = 15;
export const CALLBACK_NOTICE_MINUTES = 60;
export const CALLBACK_DAYS = 30;
const CALLBACK_OPEN_MINUTE = 9 * 60;
const MINUTE = 60_000;

type Interval = { startAt: Date; endAt: Date };
type StudioInterval = Interval & { status: string };
export type CallbackAvailability = {
  timezone: string;
  durationMinutes: number;
  days: Array<{ date: string; slots: string[] }>;
};

export function callbackDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STUDIO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addLocalDays(date: string, count: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

export function callbackWindow(now: Date) {
  const firstDate = callbackDateKey(now);
  return {
    firstDate,
    start: zonedLocalDateTimeToDate(`${firstDate}T00:00`, STUDIO_TIME_ZONE),
    end: zonedLocalDateTimeToDate(
      `${addLocalDays(firstDate, CALLBACK_DAYS)}T00:00`,
      STUDIO_TIME_ZONE,
    ),
  };
}

export function buildCallbackAvailability(
  now: Date,
  studio: StudioInterval[],
  reserved: Interval[],
): CallbackAvailability {
  const { firstDate } = callbackWindow(now);
  const blocked = [
    ...studio
      .filter((item) => item.status !== 'CANCELLED')
      .map((item) => ({
        start: item.startAt.getTime() - CALLBACK_BUFFER_MINUTES * MINUTE,
        end: item.endAt.getTime() + CALLBACK_BUFFER_MINUTES * MINUTE,
      })),
    ...reserved.map((item) => ({
      start: item.startAt.getTime(),
      end: item.endAt.getTime(),
    })),
  ];
  const earliest = now.getTime() + CALLBACK_NOTICE_MINUTES * MINUTE;
  const days = Array.from({ length: CALLBACK_DAYS }, (_, offset) => {
    const date = addLocalDays(firstDate, offset);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const hours = site.hours.find((item) =>
      (item.weekdays as readonly number[]).includes(weekday),
    )!;
    const openMinute = Math.max(hours.openMinute, CALLBACK_OPEN_MINUTE);
    const opening = zonedLocalDateTimeToDate(
      `${date}T${String(openMinute / 60).padStart(2, '0')}:00`,
      STUDIO_TIME_ZONE,
    ).getTime();
    const slots: string[] = [];
    // Office hours never cross the overnight DST transition.
    for (
      let minute = 0;
      minute + CALLBACK_MINUTES <= hours.closeMinute - openMinute;
      minute += CALLBACK_MINUTES
    ) {
      const start = opening + minute * MINUTE;
      const end = start + CALLBACK_MINUTES * MINUTE;
      if (
        start >= earliest &&
        !blocked.some((item) => start < item.end && end > item.start)
      ) {
        slots.push(new Date(start).toISOString());
      }
    }
    return { date, slots };
  });
  return {
    timezone: STUDIO_TIME_ZONE,
    durationMinutes: CALLBACK_MINUTES,
    days,
  };
}
