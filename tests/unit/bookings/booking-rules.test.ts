import { describe, expect, it } from 'vitest';
import {
  bookingStatusForAttendance,
  complimentaryStandardAccessCanBook,
  cancellationOutcome,
  creditAccountCanBook,
  instructorAugustStandardClassAccess,
  noShowFeeDecision,
  selectNextWaitlistEntry,
  waitlistAvailability,
  WAITLIST_CAPACITY,
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

  it('does not use credits attached to paused or cancelled memberships', () => {
    expect(creditAccountCanBook({ membershipStatus: 'ACTIVE' })).toBe(true);
    expect(creditAccountCanBook({ membershipStatus: null })).toBe(true);
    expect(creditAccountCanBook({ membershipStatus: 'PAUSED' })).toBe(false);
    expect(creditAccountCanBook({ membershipStatus: 'CANCELLED' })).toBe(false);
    expect(creditAccountCanBook({ membershipStatus: 'PAST_DUE' })).toBe(false);
  });

  it('limits complimentary standard access to non-event 50-minute classes', () => {
    expect(complimentaryStandardAccessCanBook({ customPlanType: 'COMPLIMENTARY_STANDARD_50MIN', isEvent: false, durationMinutes: 50 })).toBe(true);
    expect(complimentaryStandardAccessCanBook({ customPlanType: 'COMPLIMENTARY_STANDARD_50MIN', isEvent: true, durationMinutes: 50 })).toBe(false);
    expect(complimentaryStandardAccessCanBook({ customPlanType: 'COMPLIMENTARY_STANDARD_50MIN', isEvent: false, durationMinutes: 75 })).toBe(false);
    expect(complimentaryStandardAccessCanBook({ customPlanType: null, isEvent: true, durationMinutes: 90 })).toBe(true);
  });

  it('keeps the member no-show courtesy private while charging repeat and trial no-shows', () => {
    const membership = { product: { kind: 'MONTHLY_UNLIMITED', trialDays: null, priceCents: 19900 } };
    const trial = { product: { kind: 'INTRO_TRIAL', trialDays: 7, priceCents: 700 } };

    expect(noShowFeeDecision({ activeMemberships: [membership], previousNoShowCount: 0 })).toEqual({
      amountCents: 0,
      courtesyApplied: true,
      reason: 'MEMBERSHIP_COURTESY',
    });
    expect(noShowFeeDecision({ activeMemberships: [membership], previousNoShowCount: 1 }).amountCents).toBe(500);
    expect(noShowFeeDecision({ activeMemberships: [trial], previousNoShowCount: 0 }).amountCents).toBe(1000);
    expect(noShowFeeDecision({ activeMemberships: [], previousNoShowCount: 0 }).amountCents).toBe(500);
  });

  it('grants instructors free access to standard classes during August 2026 only', () => {
    expect(instructorAugustStandardClassAccess({
      role: 'INSTRUCTOR',
      occurrenceStartsAt: new Date('2026-08-15T14:00:00.000Z'),
      isEvent: false,
    })).toBe(true);
    expect(instructorAugustStandardClassAccess({
      role: 'INSTRUCTOR',
      occurrenceStartsAt: new Date('2026-08-15T14:00:00.000Z'),
      isEvent: true,
    })).toBe(false);
    expect(instructorAugustStandardClassAccess({
      role: 'MEMBER',
      occurrenceStartsAt: new Date('2026-08-15T14:00:00.000Z'),
      isEvent: false,
    })).toBe(false);
    expect(instructorAugustStandardClassAccess({
      role: 'INSTRUCTOR',
      occurrenceStartsAt: new Date('2026-09-01T04:00:00.000Z'),
      isEvent: false,
    })).toBe(false);
  });

  it('caps every class waitlist at five people', () => {
    expect(WAITLIST_CAPACITY).toBe(5);
    expect(waitlistAvailability(0)).toEqual({ canJoin: true, remaining: 5 });
    expect(waitlistAvailability(4)).toEqual({ canJoin: true, remaining: 1 });
    expect(waitlistAvailability(5)).toEqual({ canJoin: false, remaining: 0 });
    expect(waitlistAvailability(8)).toEqual({ canJoin: false, remaining: 0 });
  });
});
