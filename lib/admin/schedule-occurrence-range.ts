export type ScheduleOccurrenceRangeKey = 'day' | 'week' | 'month';

type ScheduleOccurrenceSearchParams = {
  range?: string;
};

const NEW_YORK_TIME_ZONE = 'America/New_York';

function newYorkDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NEW_YORK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function newYorkBoundary(year: number, month: number, day: number) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NEW_YORK_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(utcGuess);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  const second = Number(parts.find((part) => part.type === 'second')?.value);
  return new Date(utcGuess.getTime() - ((hour * 60 + minute) * 60 + second) * 1_000);
}

export function resolveScheduleOccurrenceRange(
  params: ScheduleOccurrenceSearchParams,
  now = new Date(),
) {
  const requested = params.range as ScheduleOccurrenceRangeKey;
  const key: ScheduleOccurrenceRangeKey = ['day', 'week', 'month'].includes(requested)
    ? requested
    : 'month';
  let start: Date;
  let endExclusive: Date;
  let label: string;
  const parts = newYorkDateParts(now);

  if (key === 'day') {
    start = newYorkBoundary(parts.year, parts.month, parts.day);
    endExclusive = newYorkBoundary(parts.year, parts.month, parts.day + 1);
    label = 'Today';
  } else if (key === 'week') {
    const weekday = new Date(`${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T12:00:00.000Z`).getUTCDay();
    const mondayOffset = (weekday + 6) % 7;
    start = newYorkBoundary(parts.year, parts.month, parts.day - mondayOffset);
    endExclusive = newYorkBoundary(parts.year, parts.month, parts.day - mondayOffset + 7);
    label = 'This week';
  } else {
    start = newYorkBoundary(parts.year, parts.month, 1);
    endExclusive = newYorkBoundary(parts.year, parts.month + 1, 1);
    label = 'This month';
  }

  return { key, start, end: endExclusive, label };
}
