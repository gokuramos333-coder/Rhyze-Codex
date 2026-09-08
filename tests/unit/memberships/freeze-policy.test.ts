import { describe, expect, it } from 'vitest';
import {
  freezeDaysInCalendarYear,
  validateMembershipFreeze,
} from '@/lib/domain/memberships/freeze-policy';

describe('membership freeze policy', () => {
  it('allows a combined maximum of 92 days in one calendar year', () => {
    const existing = [{ startAt: new Date('2026-01-01T12:00:00Z'), endAt: new Date('2026-02-01T12:00:00Z') }];
    expect(validateMembershipFreeze({
      startAt: new Date('2026-06-01T12:00:00Z'),
      endAt: new Date('2026-08-01T12:00:00Z'),
      existing,
    })).toEqual({ valid: true, totalDays: 92 });
  });

  it('rejects overlaps and more than 92 combined days', () => {
    const existing = [{ startAt: new Date('2026-01-01T12:00:00Z'), endAt: new Date('2026-02-01T12:00:00Z') }];
    expect(validateMembershipFreeze({
      startAt: new Date('2026-01-15T12:00:00Z'),
      endAt: new Date('2026-01-20T12:00:00Z'),
      existing,
    }).valid).toBe(false);
    expect(validateMembershipFreeze({
      startAt: new Date('2026-06-01T12:00:00Z'),
      endAt: new Date('2026-08-02T12:00:00Z'),
      existing,
    }).valid).toBe(false);
  });

  it('counts only the portion of a cross-year freeze inside the selected year', () => {
    expect(freezeDaysInCalendarYear(
      { startAt: new Date('2026-12-20T12:00:00Z'), endAt: new Date('2027-01-10T12:00:00Z') },
      2026,
    )).toBe(12);
  });
});
