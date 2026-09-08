export type EarningsPeriod = 'week' | 'biweek' | 'month' | 'year' | 'lifetime' | 'custom';

export function earningsPeriodStart(period: EarningsPeriod, now = new Date()) {
  if (period === 'custom') return null;
  if (period === 'lifetime') return null;
  if (period === 'year') return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  if (period === 'month') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const day = now.getUTCDay() || 7;
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 1));
  return period === 'biweek'
    ? new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1_000)
    : weekStart;
}

export function earningsDateRange(
  period: EarningsPeriod,
  now = new Date(),
  from?: string,
  to?: string,
) {
  if (period !== 'custom') {
    return { start: earningsPeriodStart(period, now), end: null };
  }
  const start = from ? new Date(`${from}T00:00:00.000Z`) : null;
  const end = to ? new Date(`${to}T23:59:59.999Z`) : null;
  return {
    start: start && !Number.isNaN(start.getTime()) ? start : null,
    end: end && !Number.isNaN(end.getTime()) ? end : null,
  };
}
