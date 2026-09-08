export const TRIAL_POLICY_VERSION = 'intro-trial-attendance-2026-08-21';

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
    },
  };
}
