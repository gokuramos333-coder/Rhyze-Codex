import { describe, expect, it, vi } from 'vitest';
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
    expect(
      resolveScheduleOccurrenceRange({ range: 'week' }, now, 'day').key,
    ).toBe('week');
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

it('supports a selected year and inclusive custom end dates through exclusive query boundaries', () => {
  const now = new Date('2026-09-29T16:00:00Z');
  const year = resolveScheduleOccurrenceRange(
    { range: 'year', date: '2025-08-03' },
    now,
  );
  expect(year.key).toBe('year');
  expect(year.start.toISOString()).toBe('2025-01-01T05:00:00.000Z');
  expect(year.end.toISOString()).toBe('2026-01-01T05:00:00.000Z');
  const custom = resolveScheduleOccurrenceRange(
    { range: 'custom', from: '2026-03-07', to: '2026-03-09' },
    now,
  );
  expect(custom.key).toBe('custom');
  expect(custom.start.toISOString()).toBe('2026-03-07T05:00:00.000Z');
  expect(custom.end.toISOString()).toBe('2026-03-10T04:00:00.000Z');
});

// Nov 1, 2026 is both the last day of this calendar week and the fall-back day.
// A locale rendering midnight as 24:00 must not remove Sunday from the query.
describe('Eastern calendar boundaries across daylight saving and winter', () => {
  it('includes both November 1 morning classes in the week opened from October 30', () => {
    const range = resolveScheduleOccurrenceRange(
      { range: 'week', date: '2026-10-30' },
      new Date('2026-10-30T16:00:00Z'),
    );
    expect(range.start.toISOString()).toBe('2026-10-26T04:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-11-02T05:00:00.000Z');
    for (const startAt of ['2026-11-01T14:00:00Z', '2026-11-01T15:00:00Z']) {
      expect(new Date(startAt) >= range.start && new Date(startAt) < range.end).toBe(true);
    }
  });

  it.each([
    ['2026-11-01', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z', 25],
    ['2026-11-02', '2026-11-02T05:00:00.000Z', '2026-11-03T05:00:00.000Z', 24],
    ['2026-03-08', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z', 23],
    ['2027-01-01', '2027-01-01T05:00:00.000Z', '2027-01-02T05:00:00.000Z', 24],
  ])('keeps the complete local day %s', (date, start, end, hours) => {
    const range = resolveScheduleOccurrenceRange({ range: 'day', date });
    expect(range.start.toISOString()).toBe(start);
    expect(range.end.toISOString()).toBe(end);
    expect((range.end.getTime() - range.start.getTime()) / 3_600_000).toBe(hours);
  });

  it('keeps the entire November month instead of starting or ending a day early', () => {
    const range = resolveScheduleOccurrenceRange({ range: 'month', date: '2026-11-01' });
    expect(range.start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-12-01T05:00:00.000Z');
    expect(range.label).toBe('November 2026');
  });
});


it('does not depend on the runtime choosing 00:00 over 24:00 for midnight', () => {
  const NativeFormatter = Intl.DateTimeFormat;
  // Reproduce Node 20's en-US midnight convention even on newer ICU runtimes.
  const formatter = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function(locales, options) {
    return new NativeFormatter(locales, options?.hour12 === false
      ? { ...options, hour12: undefined, hourCycle: 'h24' }
      : options);
  });
  try {
    const range = resolveScheduleOccurrenceRange({ range: 'week', date: '2026-10-30' });
    expect(range.end.toISOString()).toBe('2026-11-02T05:00:00.000Z');
  } finally {
    formatter.mockRestore();
  }
});
