export type RevenueRecord = {
  amountCents: number;
  occurredAt: Date;
  customerId: string;
  type: string;
  source: 'SOMBLE' | 'RHYZE';
};

export type DailyRevenuePoint = {
  date: Date;
  label: string;
  amountCents: number;
};

const NEW_YORK_TIME_ZONE = 'America/New_York';

const dayKey = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NEW_YORK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

function newYorkDateParts(value: Date) {
  const [year, month, day] = dayKey(value).split('-').map(Number);
  return { year, month, day };
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

export function summarizeRevenue(records: RevenueRecord[]) {
  const customers = new Set<string>();
  const bySource = { SOMBLE: 0, RHYZE: 0 };
  const byType: Record<string, number> = {};
  let totalCents = 0;

  for (const record of records) {
    totalCents += record.amountCents;
    customers.add(record.customerId);
    bySource[record.source] += record.amountCents;
    byType[record.type] = (byType[record.type] ?? 0) + record.amountCents;
  }

  return {
    totalCents,
    uniqueCustomers: customers.size,
    bySource,
    byType,
  };
}

export function buildDailyRevenueSeries(
  records: RevenueRecord[],
  start: Date,
  end: Date,
): DailyRevenuePoint[] {
  const totals = new Map<string, number>();
  for (const record of records) {
    const key = dayKey(record.occurredAt);
    totals.set(key, (totals.get(key) ?? 0) + record.amountCents);
  }

  const cursor = new Date(start);
  const last = new Date(end);
  const points: DailyRevenuePoint[] = [];

  while (cursor <= last) {
    points.push({
      date: new Date(cursor),
      label: cursor.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: NEW_YORK_TIME_ZONE,
      }),
      amountCents: totals.get(dayKey(cursor)) ?? 0,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return points;
}

export function calculatePeriodTotals(records: RevenueRecord[], now = new Date()) {
  const parts = newYorkDateParts(now);
  const weekday = new Date(`${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T12:00:00.000Z`).getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  const weekStart = newYorkBoundary(parts.year, parts.month, parts.day - mondayOffset);
  const monthStart = newYorkBoundary(parts.year, parts.month, 1);
  const yearStart = newYorkBoundary(parts.year, 1, 1);
  const totalSince = (start: Date | null) =>
    records.reduce(
      (total, record) =>
        !start || record.occurredAt >= start ? total + record.amountCents : total,
      0,
    );

  return {
    weekCents: totalSince(weekStart),
    monthCents: totalSince(monthStart),
    yearCents: totalSince(yearStart),
    lifetimeCents: totalSince(null),
  };
}

export function recordsInRange(
  records: RevenueRecord[],
  start: Date,
  end: Date,
) {
  return records.filter(
    (record) => record.occurredAt >= start && record.occurredAt <= end,
  );
}
