import { describe, expect, it } from 'vitest';
import {
  earningsDateRange,
  earningsPeriodStart,
} from '@/lib/domain/referrals/earnings-periods';

describe('referral earnings periods', () => {
  const now = new Date('2026-07-23T18:00:00Z');
  it('calculates weekly, monthly, yearly, and lifetime starts', () => {
    expect(earningsPeriodStart('week', now)?.toISOString()).toBe(
      '2026-07-20T04:00:00.000Z',
    );
    expect(earningsPeriodStart('month', now)?.toISOString()).toBe(
      '2026-07-01T04:00:00.000Z',
    );
    expect(earningsPeriodStart('year', now)?.toISOString()).toBe(
      '2026-01-01T05:00:00.000Z',
    );
    expect(earningsPeriodStart('lifetime', now)).toBeNull();
  });

  it('supports bi-weekly and inclusive custom referral ranges', () => {
    expect(earningsDateRange('biweek', now).start?.toISOString()).toBe(
      '2026-07-13T04:00:00.000Z',
    );
    expect(
      earningsDateRange('custom', now, '2026-07-01', '2026-07-10'),
    ).toEqual({
      start: new Date('2026-07-01T04:00:00.000Z'),
      end: new Date('2026-07-11T03:59:59.999Z'),
    });
  });
});

it('uses the New York month before midnight and respects both DST offsets in a biweek', () => {
  expect(
    earningsPeriodStart(
      'month',
      new Date('2026-08-01T02:00:00Z'),
    )?.toISOString(),
  ).toBe('2026-07-01T04:00:00.000Z');
  const range = earningsDateRange('biweek', new Date('2026-11-03T12:00:00Z'));
  expect(range.start?.toISOString()).toBe('2026-10-26T04:00:00.000Z');
  expect(range.end?.toISOString()).toBe('2026-11-09T04:59:59.999Z');
});
it('keeps lifetime unbounded and invalid custom dates from expanding to lifetime', () => {
  expect(earningsDateRange('lifetime')).toEqual({ start: null, end: null });
  expect(
    earningsDateRange(
      'custom',
      new Date('2026-07-23T18:00:00Z'),
      '2026-02-30',
      '2026-03-01',
    ).start?.toISOString(),
  ).toBe('2026-07-01T04:00:00.000Z');
});
