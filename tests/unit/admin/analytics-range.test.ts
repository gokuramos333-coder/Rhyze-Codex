import { describe, expect, it } from 'vitest';
import { resolveAnalyticsRange } from '@/lib/admin/analytics-range';

describe('admin analytics date ranges', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');

  it('resolves day, week, month, and year periods', () => {
    expect(resolveAnalyticsRange({ range: 'day' }, now).label).toBe('Today');
    expect(resolveAnalyticsRange({ range: 'week' }, now).label).toBe('This week');
    expect(resolveAnalyticsRange({ range: 'month' }, now).label).toBe('This month');
    expect(resolveAnalyticsRange({ range: 'year' }, now).label).toBe('This year');
  });

  it('uses New York day boundaries for daily revenue totals', () => {
    const range = resolveAnalyticsRange(
      { range: 'day' },
      new Date('2026-07-24T12:00:00.000Z'),
    );

    expect(range.start.toISOString()).toBe('2026-07-24T04:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-07-25T03:59:59.999Z');
  });

  it('uses an explicit inclusive custom date range', () => {
    const range = resolveAnalyticsRange(
      { range: 'custom', from: '2026-07-01', to: '2026-07-10' },
      now,
    );

    expect(range.start.toISOString()).toBe('2026-07-01T04:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-07-11T03:59:59.999Z');
    expect(range.label).toBe('Jul 1 – Jul 10');
  });
});
