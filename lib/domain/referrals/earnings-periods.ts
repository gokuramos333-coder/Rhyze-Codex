export type EarningsPeriod = 'week' | 'month' | 'year' | 'lifetime';

export function earningsPeriodStart(period: EarningsPeriod, now = new Date()) {
  if (period === 'lifetime') return null;
  if (period === 'year') return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  if (period === 'month') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const day = now.getUTCDay() || 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day + 1));
}
