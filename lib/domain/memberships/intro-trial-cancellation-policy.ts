import { INTRO_TRIAL_DAYS } from '@/lib/domain/bookings/intro-trial-rules';

type Trial = {
  status: string;
  stripeSubscriptionId: string | null;
  activatedAt: Date | null;
  currentPeriodEnd: Date | null;
  product: { kind: string; trialDays: number | null; billingInterval: string };
};

export function canCancelIntroTrial(trial: Trial, now: Date): boolean {
  return (
    trial.product.kind === 'INTRO_TRIAL' &&
    trial.product.trialDays === INTRO_TRIAL_DAYS &&
    trial.product.billingInterval === 'ONE_TIME' &&
    !trial.stripeSubscriptionId &&
    ['ACTIVE', 'TRIALING', 'PAUSED'].includes(trial.status) &&
    (!trial.currentPeriodEnd || trial.currentPeriodEnd > now) &&
    (!trial.activatedAt ||
      +trial.activatedAt + INTRO_TRIAL_DAYS * 86400000 > +now)
  );
}

/** Historical funding requires an exact account; one trial in the account
 * history is not proof of ownership of an unlinked booking. */
export function trialBookingScope(
  snapshot: unknown,
  accountId: string,
  _trialCount: number,
): 'cancel' | 'review' | 'preserve' {
  const saved = snapshot as {
    accessType?: unknown;
    creditAccountId?: unknown;
  } | null;
  if (saved?.creditAccountId === accountId)
    return saved.accessType === 'INTRO_TRIAL' ? 'cancel' : 'review';
  if (saved?.accessType === 'INTRO_TRIAL') {
    if (typeof saved.creditAccountId === 'string' && saved.creditAccountId)
      return 'preserve';
    return 'review';
  }
  if (typeof saved?.creditAccountId === 'string' && saved.creditAccountId)
    return 'preserve';
  if (['VIP', 'COMPLIMENTARY', 'EVENT'].includes(String(saved?.accessType)))
    return 'preserve';
  return 'review';
}
