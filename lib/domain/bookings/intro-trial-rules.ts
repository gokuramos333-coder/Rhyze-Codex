export const INTRO_TRIAL_DAYS = 7;
export const INTRO_TRIAL_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;
export const INTRO_TRIAL_AVAILABLE_AT = new Date('2026-07-30T04:00:00.000Z');

export function introTrialReminderAt(expiresAt: Date) {
  return new Date(expiresAt.getTime() - INTRO_TRIAL_REMINDER_LEAD_MS);
}

type IntroTrialBookingInput = {
  activatedAt: Date | null;
  occurrenceStartsAt: Date;
  now: Date;
  isEvent: boolean;
};

type IntroTrialBookingResult =
  | { allowed: true; activatesAt: Date; expiresAt: Date }
  | {
      allowed: false;
      reason: 'not-open' | 'event-excluded' | 'outside-window' | 'expired';
    };

export function evaluateIntroTrialBooking(
  input: IntroTrialBookingInput,
): IntroTrialBookingResult {
  if (input.now < INTRO_TRIAL_AVAILABLE_AT) {
    return { allowed: false, reason: 'not-open' };
  }
  if (input.isEvent) {
    return { allowed: false, reason: 'event-excluded' };
  }

  const activatesAt = input.activatedAt || input.occurrenceStartsAt;
  const expiresAt = new Date(
    activatesAt.getTime() + INTRO_TRIAL_DAYS * 24 * 60 * 60 * 1000,
  );
  if (input.now >= expiresAt) {
    return { allowed: false, reason: 'expired' };
  }
  if (input.occurrenceStartsAt >= expiresAt) {
    return { allowed: false, reason: 'outside-window' };
  }
  return { allowed: true, activatesAt, expiresAt };
}
