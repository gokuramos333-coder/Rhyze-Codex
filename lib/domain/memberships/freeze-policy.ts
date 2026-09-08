const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_FREEZE_DAYS_PER_YEAR = 92;

export type FreezePeriod = { startAt: Date; endAt: Date };

function utcDay(value: Date) {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

export function freezeDaysInCalendarYear(period: FreezePeriod, year: number) {
  const yearStart = Date.UTC(year, 0, 1);
  const nextYear = Date.UTC(year + 1, 0, 1);
  const start = Math.max(utcDay(period.startAt), yearStart);
  const end = Math.min(utcDay(period.endAt), nextYear);
  return Math.max(0, Math.ceil((end - start) / DAY_MS));
}

export function validateMembershipFreeze({
  startAt,
  endAt,
  existing,
}: FreezePeriod & { existing: FreezePeriod[] }):
  | { valid: true; totalDays: number }
  | { valid: false; reason: string; totalDays: number } {
  if (endAt <= startAt) {
    return { valid: false, reason: 'End date must be after the start date.', totalDays: 0 };
  }
  if (
    existing.some(
      (period) => startAt < period.endAt && endAt > period.startAt,
    )
  ) {
    return { valid: false, reason: 'Freeze dates cannot overlap.', totalDays: 0 };
  }

  const years = new Set<number>([
    startAt.getUTCFullYear(),
    endAt.getUTCFullYear(),
    ...existing.flatMap((period) => [
      period.startAt.getUTCFullYear(),
      period.endAt.getUTCFullYear(),
    ]),
  ]);
  let requestedYearTotal = 0;
  for (const year of years) {
    const totalDays = [...existing, { startAt, endAt }].reduce(
      (total, period) => total + freezeDaysInCalendarYear(period, year),
      0,
    );
    if (year === startAt.getUTCFullYear()) requestedYearTotal = totalDays;
    if (totalDays > MAX_FREEZE_DAYS_PER_YEAR) {
      return {
        valid: false,
        reason: `Membership freezes are limited to ${MAX_FREEZE_DAYS_PER_YEAR} days per calendar year.`,
        totalDays,
      };
    }
  }
  return { valid: true, totalDays: requestedYearTotal };
}
