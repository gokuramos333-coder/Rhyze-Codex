export type AnalyticsRangeKey = 'day' | 'week' | 'month' | 'year' | 'custom';

type AnalyticsSearchParams = {
  range?: string;
  from?: string;
  to?: string;
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

function inclusiveEndFromExclusiveBoundary(value: Date) {
  return new Date(value.getTime() - 1);
}

function newYorkDay(value: string, end = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const boundary = newYorkBoundary(year, month, day + (end ? 1 : 0));
  return end ? inclusiveEndFromExclusiveBoundary(boundary) : boundary;
}

function shortDate(value: Date) {
  return value.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: NEW_YORK_TIME_ZONE,
  });
}

export function resolveAnalyticsRange(
  params: AnalyticsSearchParams,
  now = new Date(),
) {
  const requested = params.range as AnalyticsRangeKey;
  const key: AnalyticsRangeKey = [
    'day',
    'week',
    'month',
    'year',
    'custom',
  ].includes(requested)
    ? requested
    : 'month';
  const parts = newYorkDateParts(now);
  let endExclusive: Date;
  let start: Date;
  let label: string;

  if (key === 'custom') {
    const customStart = params.from ? newYorkDay(params.from) : null;
    const customEnd = params.to ? newYorkDay(params.to, true) : null;
    if (customStart && customEnd && customStart <= customEnd) {
      return {
        key,
        start: customStart,
        end: customEnd,
        label: `${shortDate(customStart)} – ${shortDate(customEnd)}`,
      };
    }
  }

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
  } else if (key === 'year') {
    start = newYorkBoundary(parts.year, 1, 1);
    endExclusive = newYorkBoundary(parts.year + 1, 1, 1);
    label = 'This year';
  } else {
    start = newYorkBoundary(parts.year, parts.month, 1);
    endExclusive = newYorkBoundary(parts.year, parts.month + 1, 1);
    label = 'This month';
  }

  return { key: key === 'custom' ? 'month' : key, start, end: inclusiveEndFromExclusiveBoundary(endExclusive), label };
}
