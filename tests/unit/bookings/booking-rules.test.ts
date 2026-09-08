import { describe, expect, it } from 'vitest';
import {
  attendanceStatusCountsAsAttended,
  bookingStatusForAttendance,
  complimentaryStandardAccessCanBook,
  cancellationOutcome,
  creditAccountCanBook,
  eventCreditCanBook,
  instructorAugustStandardClassAccess,
  noShowFeeDecision,
  selectNextWaitlistEntry,
  waitlistAvailability,
  WAITLIST_CAPACITY,
} from '@/lib/domain/bookings/booking-rules';
import {
  cancellationCreditDecision,
  eventCancellationCreditTerms,
  eventCancellationCreditKey,
  eventCancellationCreditLabel,
} from '@/lib/domain/bookings/cancellation-credit';

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

  it('counts both instructor check-ins and imported attended records as completed attendance', () => {
    expect(attendanceStatusCountsAsAttended('CHECKED_IN')).toBe(true);
    expect(attendanceStatusCountsAsAttended('ATTENDED')).toBe(true);
    expect(attendanceStatusCountsAsAttended('NO_SHOW')).toBe(false);
    expect(attendanceStatusCountsAsAttended('LATE_CANCELLED')).toBe(false);
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
    expect(cancellationOutcome(startAt, new Date('2026-07-24T12:00:00Z'), 120)).toEqual({
      status: 'LATE_CANCELLED',
      restoreCredit: false,
    });
  });

  it('expires a returned event credit exactly 30 days after cancellation', () => {
    expect(eventCancellationCreditTerms(new Date('2026-08-10T15:30:00.000Z'))).toEqual({
      validFrom: new Date('2026-08-10T15:30:00.000Z'),
      validUntil: new Date('2026-09-09T15:30:00.000Z'),
      quantity: 1,
    });
    expect(eventCancellationCreditTerms(new Date('2026-12-15T18:00:00.000Z'))).toEqual({
      validFrom: new Date('2026-12-15T18:00:00.000Z'),
      validUntil: new Date('2027-01-14T18:00:00.000Z'),
      quantity: 1,
    });
  });

  it('keeps restored event credits available for events only', () => {
    expect(eventCreditCanBook({ label: 'Event credit — Breathwork', sourceProductKind: null, isEvent: true })).toBe(true);
    expect(eventCreditCanBook({ label: 'Event credit — Breathwork', sourceProductKind: null, isEvent: false })).toBe(false);
    expect(eventCreditCanBook({ label: 'Manual admin credit — expires Aug 30', sourceProductKind: null, isEvent: true })).toBe(false);
    expect(eventCreditCanBook({ label: 'Event credit — Breathwork', sourceProductKind: 'DROP_IN', isEvent: true })).toBe(false);
    expect(eventCreditCanBook({ label: 'VIP membership — unlimited standard class credits — September 2026', sourceProductKind: null, isEvent: true, className: 'Seat Seduction With Vanessa' })).toBe(false);
    expect(eventCreditCanBook({ label: 'Event credit — August VIP', sourceProductKind: null, isEvent: true, className: 'TCJ Hip-Hop Happy Hour with Tricia' })).toBe(false);
    expect(eventCreditCanBook({ label: 'Event credit — August VIP', sourceProductKind: null, isEvent: true, instructorName: 'Tricia Jones' })).toBe(false);
    expect(eventCreditCanBook({ label: 'Event credit — September 2026 VIP complimentary event credit', sourceProductKind: null, isEvent: true, instructorName: 'Tricia Johnsen' })).toBe(false);
  });

  it('creates a replacement event credit when an early event cancellation has no reservation', () => {
    expect(cancellationCreditDecision({
      isEvent: true,
      restoreCredit: true,
      hasReservation: false,
    })).toBe('CREATE_EVENT_CREDIT');
    expect(eventCancellationCreditLabel('Hypnotic Heels with Nicole')).toBe(
      'Event credit — Hypnotic Heels with Nicole',
    );
    expect(eventCancellationCreditKey('booking-123')).toBe(
      'event-cancellation:booking-123',
    );
  });

  it('releases an existing reservation and never restores a late-cancel credit', () => {
    expect(cancellationCreditDecision({
      isEvent: true,
      restoreCredit: true,
      hasReservation: true,
    })).toBe('RELEASE_RESERVATION');
    expect(cancellationCreditDecision({
      isEvent: true,
      restoreCredit: false,
      hasReservation: false,
    })).toBe('NONE');
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

  it('charges every non-complimentary no-show ten dollars', () => {
    const membership = { product: { kind: 'MONTHLY_UNLIMITED', trialDays: null, priceCents: 19900 } };
    const trial = { product: { kind: 'INTRO_TRIAL', trialDays: 7, priceCents: 700 } };
    const vip = { product: { kind: 'VIP', trialDays: null, priceCents: 19900 } };

    expect(noShowFeeDecision({ activeMemberships: [membership], previousNoShowCount: 0 }).amountCents).toBe(1_000);
    expect(noShowFeeDecision({ activeMemberships: [membership], previousNoShowCount: 1 }).amountCents).toBe(1_000);
    expect(noShowFeeDecision({ activeMemberships: [trial], previousNoShowCount: 0 }).amountCents).toBe(1000);
    expect(noShowFeeDecision({ activeMemberships: [vip], previousNoShowCount: 0 })).toEqual({
      amountCents: 1_000,
      courtesyApplied: false,
      reason: 'VIP',
    });
    expect(noShowFeeDecision({
      activeMemberships: [vip],
      previousNoShowCount: 0,
      accessType: 'INTRO_TRIAL',
    }).amountCents).toBe(1_000);
    expect(noShowFeeDecision({
      activeMemberships: [trial],
      previousNoShowCount: 1,
      accessType: 'STANDARD',
    }).amountCents).toBe(1_000);
    expect(noShowFeeDecision({ activeMemberships: [], previousNoShowCount: 0 }).amountCents).toBe(1_000);
    expect(noShowFeeDecision({
      activeMemberships: [vip],
      previousNoShowCount: 3,
      bookingSource: 'OWNER_COMPLIMENTARY',
    }).amountCents).toBe(0);
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
