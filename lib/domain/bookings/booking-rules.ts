export type AttendanceValue =
  | 'CHECKED_IN'
  | 'ATTENDED'
  | 'NO_SHOW'
  | 'LATE_CANCELLED';

export const WAITLIST_CAPACITY = 5;
export const COMPLIMENTARY_STANDARD_50MIN_PLAN = 'COMPLIMENTARY_STANDARD_50MIN';

export function waitlistAvailability(waitingCount: number) {
  const remaining = Math.max(0, WAITLIST_CAPACITY - waitingCount);
  return { canJoin: remaining > 0, remaining };
}

export function selectNextWaitlistEntry<
  T extends { status: string; joinedAt: Date },
>(entries: T[]): T | undefined {
  return entries
    .filter((entry) => entry.status === 'WAITING')
    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
}

export function bookingStatusForAttendance(status: AttendanceValue) {
  if (status === 'ATTENDED') return 'ATTENDED' as const;
  if (status === 'NO_SHOW') return 'NO_SHOW' as const;
  if (status === 'LATE_CANCELLED') return 'LATE_CANCELLED' as const;
  return 'CONFIRMED' as const;
}

export function cancellationOutcome(
  startAt: Date,
  cancelledAt: Date,
  cutoffMinutes: number,
) {
  const cutoffAt = startAt.getTime() - cutoffMinutes * 60_000;
  const late = cancelledAt.getTime() > cutoffAt;
  return {
    status: late ? ('LATE_CANCELLED' as const) : ('CANCELLED' as const),
    restoreCredit: !late,
  };
}

export const INSTRUCTOR_AUGUST_STANDARD_ACCESS_START = new Date('2026-08-01T04:00:00.000Z');
export const INSTRUCTOR_AUGUST_STANDARD_ACCESS_END = new Date('2026-09-01T04:00:00.000Z');

export function creditAccountCanBook(input: { membershipStatus: string | null }) {
  return input.membershipStatus === null || ['ACTIVE', 'TRIALING'].includes(input.membershipStatus);
}

export function complimentaryStandardAccessCanBook(input: {
  customPlanType: string | null | undefined;
  isEvent: boolean;
  durationMinutes: number;
}) {
  return (
    input.customPlanType !== COMPLIMENTARY_STANDARD_50MIN_PLAN ||
    (!input.isEvent && input.durationMinutes === 50)
  );
}

export function noShowFeeDecision(input: {
  activeMemberships: Array<{
    product: { kind: string; trialDays: number | null; priceCents: number };
  }>;
  previousNoShowCount: number;
}) {
  const hasIntroTrial = input.activeMemberships.some(
    (membership) =>
      membership.product.kind === 'INTRO_TRIAL' ||
      (membership.product.trialDays === 7 && membership.product.priceCents === 700),
  );
  if (hasIntroTrial) {
    return { amountCents: 1_000, courtesyApplied: false, reason: 'INTRO_TRIAL' as const };
  }

  const hasMembership = input.activeMemberships.length > 0;
  if (hasMembership && input.previousNoShowCount === 0) {
    return { amountCents: 0, courtesyApplied: true, reason: 'MEMBERSHIP_COURTESY' as const };
  }

  return {
    amountCents: 500,
    courtesyApplied: false,
    reason: hasMembership ? ('MEMBERSHIP_REPEAT' as const) : ('STANDARD' as const),
  };
}

function monthKeyInNewYork(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(value);
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
}

export function standardSingleClassCreditCanBook(input: {
  productKind: string | null | undefined;
  paidAt: Date | null | undefined;
  occurrenceStartsAt: Date;
  isEvent: boolean;
  validUntil?: Date | null;
}) {
  return (
    input.productKind === 'DROP_IN' &&
    !!input.paidAt &&
    !input.isEvent &&
    monthKeyInNewYork(input.paidAt) === monthKeyInNewYork(input.occurrenceStartsAt) &&
    (!input.validUntil || input.occurrenceStartsAt <= input.validUntil)
  );
}

export function singleClassCreditValidUntil(paidAt: Date) {
  const validUntil = new Date(paidAt);
  validUntil.setMonth(validUntil.getMonth() + 1);
  return validUntil;
}

export function instructorAugustStandardClassAccess(input: {
  role: string | null | undefined;
  occurrenceStartsAt: Date;
  isEvent: boolean;
}) {
  return (
    input.role === 'INSTRUCTOR' &&
    !input.isEvent &&
    input.occurrenceStartsAt >= INSTRUCTOR_AUGUST_STANDARD_ACCESS_START &&
    input.occurrenceStartsAt < INSTRUCTOR_AUGUST_STANDARD_ACCESS_END
  );
}
