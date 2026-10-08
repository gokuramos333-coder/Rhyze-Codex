export const TRIAL_POLICY_VERSION = 'intro-trial-attendance-2026-10-08';
export const TRIAL_POLICY_TITLE = 'Late Cancellation & No-Show Policy';
export const TRIAL_POLICY_TEXT = "Studio spots are reserved exclusively for booked guests. Any cancellation made within 2 hours of class start time, or an unattended session, will result in an automatic, non-refundable $10 late fee charged to your card on file. Thank you for respecting our instructors' schedules and your fellow Rhyze Tribe members' availability.";
export const TRIAL_CARD_AUTHORIZATION = "I authorize Rhyze Fitness to retain my card on file and automatically bill a non-refundable $10 fee for any class reservation cancelled within 2 hours of start time or marked as a no-show.";

export function parseTrialPolicyConsent(
  accepted: FormDataEntryValue | null,
  acceptedAt = new Date(),
) {
  if (accepted !== 'on') {
    throw new Error(
      'Accept the intro-trial cancellation and no-show policy to continue.',
    );
  }
  return {
    policyAcceptedAt: acceptedAt,
    policyAcceptance: {
      version: TRIAL_POLICY_VERSION,
      productKind: 'INTRO_TRIAL' as const,
      standardClassesOnly: true,
      trialDays: 7,
      lateCancellationWindowMinutes: 120,
      lateCancellationFeeCents: 1_000,
      noShowFeeCents: 1_000,
      savedPaymentMethodConsent: true,
      nonRefundable: true,
      authorizationText: TRIAL_CARD_AUTHORIZATION,
      policyText: TRIAL_POLICY_TEXT,
    },
  };
}
