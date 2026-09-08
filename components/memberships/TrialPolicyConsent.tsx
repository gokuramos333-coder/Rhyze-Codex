import React from 'react';

export function TrialPolicyConsent() {
  return (
    <label className="flex max-w-md items-start gap-3 border border-rhyze-orange/35 bg-orange-50 p-4 text-left normal-case tracking-normal">
      <input
        required
        type="checkbox"
        name="trialPolicyAccepted"
        className="mt-1 h-4 w-4 shrink-0 accent-rhyze-coral"
      />
      <span className="text-xs font-bold leading-5 text-rhyze-black/75">
        I have read and accept the Rhyze Fitness{' '}
        <a
          href="/policies#waiver"
          target="_blank"
          rel="noreferrer"
          className="text-rhyze-coral underline underline-offset-2"
        >
          liability waiver
        </a>{' '}
        and{' '}
        <a
          href="/policies#cancellation"
          target="_blank"
          rel="noreferrer"
          className="text-rhyze-coral underline underline-offset-2"
        >
          cancellation policy
        </a>
        . I understand the trial covers standard classes only; cancelling within
        2 hours incurs a $10 late-cancellation fee, and a no-show incurs a $10
        no-show fee. My payment method will be saved, and I authorize Rhyze to
        charge the saved payment method for these disclosed attendance fees.
      </span>
    </label>
  );
}
