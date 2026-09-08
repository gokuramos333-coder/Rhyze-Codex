import { describe, expect, it } from 'vitest';
import {
  bookingStatusForAttendance,
  cancellationOutcome,
  selectNextWaitlistEntry,
} from '@/lib/domain/bookings/booking-rules';

describe('booking rules', () => {
  it('promotes the earliest waiting member', () => {
    const result = selectNextWaitlistEntry([
      { id: 'later', status: 'WAITING', joinedAt: new Date('2026-07-23T12:00:00Z') },
      { id: 'left', status: 'LEFT', joinedAt: new Date('2026-07-23T09:00:00Z') },
      { id: 'first', status: 'WAITING', joinedAt: new Date('2026-07-23T10:00:00Z') },
    ]);

    expect(result?.id).toBe('first');
  });

  it('maps attendance results onto the booking', () => {
    expect(bookingStatusForAttendance('ATTENDED')).toBe('ATTENDED');
    expect(bookingStatusForAttendance('CHECKED_IN')).toBe('CONFIRMED');
    expect(bookingStatusForAttendance('NO_SHOW')).toBe('NO_SHOW');
  });

  it('uses the cancellation cutoff to decide whether a credit is released', () => {
    const startAt = new Date('2026-07-24T14:00:00Z');
    expect(cancellationOutcome(startAt, new Date('2026-07-24T10:00:00Z'), 120)).toEqual({
      status: 'CANCELLED',
      restoreCredit: true,
    });
    expect(cancellationOutcome(startAt, new Date('2026-07-24T13:00:00Z'), 120)).toEqual({
      status: 'LATE_CANCELLED',
      restoreCredit: false,
    });
  });
});
