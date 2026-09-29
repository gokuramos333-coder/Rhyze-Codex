import { resolveAnalyticsRange } from '@/lib/admin/analytics-range';

export type EarningsPeriod =
  | 'week'
  | 'biweek'
  | 'month'
  | 'year'
  | 'lifetime'
  | 'custom';

function newYorkCalendarDate(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const valueOf = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;
}

export function earningsPeriodStart(
  period: EarningsPeriod,
  now = new Date(),
): Date | null {
  if (period === 'custom' || period === 'lifetime') return null;
  return earningsDateRange(period, now).start;
}

export function earningsDateRange(
  period: EarningsPeriod,
  now = new Date(),
  from?: string,
  to?: string,
): { start: Date | null; end: Date | null } {
  if (period === 'lifetime') return { start: null, end: null };
  if (period === 'biweek') {
    const week = resolveAnalyticsRange({ range: 'week' }, now);
    const [year, month, day] = newYorkCalendarDate(week.start)
      .split('-')
      .map(Number);
    const priorMonday = new Date(Date.UTC(year, month - 1, day - 7))
      .toISOString()
      .slice(0, 10);
    const range = resolveAnalyticsRange(
      { range: 'custom', from: priorMonday, to: newYorkCalendarDate(week.end) },
      now,
    );
    return { start: range.start, end: range.end };
  }
  const range = resolveAnalyticsRange({ range: period, from, to }, now);
  return { start: range.start, end: range.end };
}
