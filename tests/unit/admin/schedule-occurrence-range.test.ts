import { describe, expect, it } from 'vitest';
import { resolveScheduleOccurrenceRange } from '@/lib/admin/schedule-occurrence-range';

describe('admin schedule occurrence ranges', () => {
  const now = new Date('2026-08-11T16:00:00.000Z');

  it('allows Admin Classes to default to the current day', () => {
    const range = resolveScheduleOccurrenceRange({}, now, 'day');

    expect(range.key).toBe('day');
    expect(range.label).toBe('Today');
    expect(range.start.toISOString()).toBe('2026-08-11T04:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-08-12T04:00:00.000Z');
  });

  it('keeps the shared default monthly for Admin Events', () => {
    expect(resolveScheduleOccurrenceRange({}, now).key).toBe('month');
  });

  it('honors an explicit range over the page default', () => {
    expect(resolveScheduleOccurrenceRange({ range: 'week' }, now, 'day').key).toBe(
      'week',
    );
  });

  it('opens an explicitly selected past day without discarding its records', () => {
    const range = resolveScheduleOccurrenceRange(
      { range: 'day', date: '2026-07-04' },
      now,
      'day',
    );

    expect(range.dateKey).toBe('2026-07-04');
    expect(range.label).toBe('Saturday, July 4');
    expect(range.start.toISOString()).toBe('2026-07-04T04:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-07-05T04:00:00.000Z');
  });

  it('uses the selected month for monthly browsing', () => {
    const range = resolveScheduleOccurrenceRange(
      { range: 'month', date: '2026-09-17' },
      now,
      'day',
    );

    expect(range.dateKey).toBe('2026-09-17');
    expect(range.label).toBe('September 2026');
    expect(range.start.toISOString()).toBe('2026-09-01T04:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-10-01T04:00:00.000Z');
  });

  it('falls back to today when the selected date is invalid', () => {
    const range = resolveScheduleOccurrenceRange(
      { range: 'day', date: 'not-a-date' },
      now,
      'day',
    );

    expect(range.dateKey).toBe('2026-08-11');
  });
});
