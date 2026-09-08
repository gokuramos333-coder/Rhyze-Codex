import { describe, expect, it } from 'vitest';
import {
  buildDailyRevenueSeries,
  calculatePeriodTotals,
  summarizeRevenue,
} from '@/lib/admin/dashboard-analytics';

describe('ADMIN dashboard analytics', () => {
  const records = [
    {
      amountCents: 700,
      occurredAt: new Date('2026-07-20T14:00:00.000Z'),
      customerId: 'one',
      type: 'Classpack',
      source: 'SOMBLE' as const,
    },
    {
      amountCents: 3000,
      occurredAt: new Date('2026-07-20T18:00:00.000Z'),
      customerId: 'one',
      type: 'Event',
      source: 'SOMBLE' as const,
    },
    {
      amountCents: 9200,
      occurredAt: new Date('2026-07-23T18:00:00.000Z'),
      customerId: 'two',
      type: 'Membership',
      source: 'RHYZE' as const,
    },
  ];

  it('combines Somble and native revenue without losing source totals', () => {
    expect(summarizeRevenue(records)).toEqual({
      totalCents: 12900,
      uniqueCustomers: 2,
      bySource: { SOMBLE: 3700, RHYZE: 9200 },
      byType: { Classpack: 700, Event: 3000, Membership: 9200 },
    });
  });

  it('groups revenue into complete daily points for graphing', () => {
    const series = buildDailyRevenueSeries(
      records,
      new Date('2026-07-20T04:00:00.000Z'),
      new Date('2026-07-23T23:59:59.000Z'),
    );

    expect(series.map((point) => point.amountCents)).toEqual([
      3700, 0, 0, 9200,
    ]);
  });

  it('keeps late-night Eastern revenue on the correct business day', () => {
    const series = buildDailyRevenueSeries(
      [
        {
          amountCents: 3000,
          occurredAt: new Date('2026-07-25T03:30:00.000Z'),
          customerId: 'one',
          type: 'Event',
          source: 'RHYZE' as const,
        },
      ],
      new Date('2026-07-24T04:00:00.000Z'),
      new Date('2026-07-25T03:59:59.999Z'),
    );

    expect(series.map((point) => point.label)).toEqual(['Jul 24']);
    expect(series.map((point) => point.amountCents)).toEqual([3000]);
  });

  it('calculates weekly, monthly, yearly, and lifetime totals', () => {
    const totals = calculatePeriodTotals(
      records,
      new Date('2026-07-24T12:00:00.000Z'),
    );

    expect(totals).toEqual({
      weekCents: 12900,
      monthCents: 12900,
      yearCents: 12900,
      lifetimeCents: 12900,
    });
  });
});
