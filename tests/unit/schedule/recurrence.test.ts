import { describe, expect, it } from 'vitest';
import { expandWeeklyRecurrence } from '@/lib/domain/schedule/recurrence-service';

describe('weekly recurrence', () => {
  it('preserves the local class time across daylight-saving changes', () => {
    const dates = expandWeeklyRecurrence({
      startLocal: '2026-10-25T09:00:00',
      timezone: 'America/New_York',
      intervalWeeks: 1,
      count: 3,
    });

    expect(dates.map((date) => date.toISOString())).toEqual([
      '2026-10-25T13:00:00.000Z',
      '2026-11-01T14:00:00.000Z',
      '2026-11-08T14:00:00.000Z',
    ]);
  });
});
