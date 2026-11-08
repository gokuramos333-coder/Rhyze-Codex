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
    ['ACTIVE', 'TRIALING'].includes(trial.status) &&
    (!trial.currentPeriodEnd || trial.currentPeriodEnd > now) &&
    (!trial.activatedAt ||
      +trial.activatedAt + INTRO_TRIAL_DAYS * 86400000 > +now)
  );
}

/** Missing legacy funding is safe only when exactly one trial ever existed.
 * Unknown snapshots cannot prove that a future booking is unrelated. */
export function trialBookingScope(
  snapshot: unknown,
  accountId: string,
  trialCount: number,
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
    return trialCount === 1 ? 'cancel' : 'review';
  }
  if (typeof saved?.creditAccountId === 'string' && saved.creditAccountId)
    return 'preserve';
  if (['VIP', 'COMPLIMENTARY', 'EVENT'].includes(String(saved?.accessType)))
    return 'preserve';
  return 'review';
}
