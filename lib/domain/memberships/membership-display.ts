const DAY_MS = 24 * 60 * 60 * 1000;

export function introTrialFallbackPeriodEnd(activatedAt: Date | null) {
  return activatedAt ? new Date(activatedAt.getTime() + 7 * DAY_MS) : null;
}

export function introTrialEffectiveActivatedAt(input: {
  activatedAt: Date | null;
  firstClassAt?: Date | null;
}) {
  return input.activatedAt ?? input.firstClassAt ?? null;
}

export function introTrialEffectivePeriodEnd(input: {
  activatedAt: Date | null;
  currentPeriodEnd: Date | null;
  firstClassAt?: Date | null;
}) {
  return input.currentPeriodEnd ?? introTrialFallbackPeriodEnd(
    introTrialEffectiveActivatedAt(input),
  );
}

export function introTrialDaysRemaining(input: {
  activatedAt: Date | null;
  currentPeriodEnd: Date | null;
  firstClassAt?: Date | null;
  now?: Date;
}): number | null {
  const activatedAt = introTrialEffectiveActivatedAt(input);
  const currentPeriodEnd = introTrialEffectivePeriodEnd(input);
  if (!activatedAt || !currentPeriodEnd) return null;
  const remainingMs = currentPeriodEnd.getTime() - (input.now ?? new Date()).getTime();
  return Math.max(0, Math.ceil(remainingMs / DAY_MS));
}

export function introTrialCreditCountdownMessage(daysRemaining: number | null) {
  if (daysRemaining === null) {
    return 'Your 7-day countdown starts when you book your first standard class.';
  }
  if (daysRemaining <= 0) return 'Trial expired';
  return `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left`;
}

export function introTrialIsExpired(input: {
  activatedAt: Date | null;
  currentPeriodEnd: Date | null;
  firstClassAt?: Date | null;
  now?: Date;
}) {
  const activatedAt = introTrialEffectiveActivatedAt(input);
  const currentPeriodEnd = introTrialEffectivePeriodEnd(input);
  return Boolean(
    activatedAt &&
      currentPeriodEnd &&
      currentPeriodEnd.getTime() <= (input.now ?? new Date()).getTime(),
  );
}
