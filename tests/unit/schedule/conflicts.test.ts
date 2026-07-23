import { describe, expect, it } from 'vitest';
import { hasScheduleConflict } from '@/lib/domain/schedule/conflict-service';

describe('schedule conflicts', () => {
  const existing = {
    startAt: new Date('2026-08-03T22:00:00.000Z'),
    endAt: new Date('2026-08-03T23:00:00.000Z'),
  };

  it('detects overlapping time ranges', () => {
    expect(
      hasScheduleConflict(existing, {
        startAt: new Date('2026-08-03T22:30:00.000Z'),
        endAt: new Date('2026-08-03T23:30:00.000Z'),
      }),
    ).toBe(true);
  });

  it('allows back-to-back classes', () => {
    expect(
      hasScheduleConflict(existing, {
        startAt: new Date('2026-08-03T23:00:00.000Z'),
        endAt: new Date('2026-08-04T00:00:00.000Z'),
      }),
    ).toBe(false);
  });
});
