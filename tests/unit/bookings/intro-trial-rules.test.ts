import { describe, expect, it } from 'vitest';
import {
  INTRO_TRIAL_DAYS,
  evaluateIntroTrialBooking,
} from '@/lib/domain/bookings/intro-trial-rules';

const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-07-30T12:00:00.000Z');

describe('intro trial booking rules', () => {
  it('does not allow the $7 trial to book before July 30 availability', () => {
    expect(
      evaluateIntroTrialBooking({
        activatedAt: null,
        occurrenceStartsAt: new Date('2026-08-03T14:00:00.000Z'),
        now: new Date('2026-07-29T23:59:59-04:00'),
        isEvent: false,
      }),
    ).toEqual({ allowed: false, reason: 'not-open' });
  });

  it('activates on the first booked class date and permits classes inside seven days', () => {
    const firstBookedClass = new Date('2026-08-05T14:00:00.000Z');
    const result = evaluateIntroTrialBooking({
      activatedAt: null,
      occurrenceStartsAt: firstBookedClass,
      now,
      isEvent: false,
    });

    expect(result).toEqual({
      allowed: true,
      activatesAt: firstBookedClass,
      expiresAt: new Date(firstBookedClass.getTime() + INTRO_TRIAL_DAYS * day),
    });
  });

  it('does not permit an event or workshop', () => {
    expect(
      evaluateIntroTrialBooking({
        activatedAt: null,
        occurrenceStartsAt: new Date(now.getTime() + day),
        now,
        isEvent: true,
      }),
    ).toEqual({ allowed: false, reason: 'event-excluded' });
  });

  it('does not permit a class after the seven-day window', () => {
    const activatedAt = new Date('2026-08-01T12:00:00.000Z');
    expect(
      evaluateIntroTrialBooking({
        activatedAt,
        occurrenceStartsAt: new Date(activatedAt.getTime() + 7 * day + 1),
        now,
        isEvent: false,
      }),
    ).toEqual({ allowed: false, reason: 'outside-window' });
  });

  it('treats the exact expiration instant as outside the trial', () => {
    const activatedAt = new Date('2026-08-01T12:00:00.000Z');
    expect(
      evaluateIntroTrialBooking({
        activatedAt,
        occurrenceStartsAt: new Date(activatedAt.getTime() + 7 * day),
        now,
        isEvent: false,
      }),
    ).toEqual({ allowed: false, reason: 'outside-window' });
  });

  it('does not permit booking once the trial itself has expired', () => {
    const activatedAt = new Date(now.getTime() - 8 * day);
    expect(
      evaluateIntroTrialBooking({
        activatedAt,
        occurrenceStartsAt: new Date(now.getTime() + day),
        now,
        isEvent: false,
      }),
    ).toEqual({ allowed: false, reason: 'expired' });
  });
});
