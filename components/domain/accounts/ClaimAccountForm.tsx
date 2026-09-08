'use client';

import React from 'react';
import { PasswordField } from './PasswordField';
import { BirthdayFields } from './BirthdayFields';

export function ClaimAccountForm({
  token,
  action,
}: {
  token: string;
  action?: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action} className="mt-8 grid gap-5">
      <input type="hidden" name="token" value={token} />
      <BirthdayFields />
      <PasswordField label="New password" name="password" />
      <PasswordField
        label="Confirm new password"
        name="passwordConfirmation"
      />
      <p className="text-xs text-rhyze-black/55">
        Use at least 9 characters with an uppercase letter, number, and symbol.
      </p>
      <div className="border border-rhyze-orange/35 bg-orange-50 p-4">
        <label className="flex items-start gap-3">
          <input
            required
            type="checkbox"
            name="waiverAccepted"
            className="mt-1 h-4 w-4 shrink-0 accent-rhyze-coral"
          />
          <span className="text-sm font-bold leading-6">
            I have reviewed and accept the required Rhyze Fitness{' '}
            <a
              href="/policies"
              target="_blank"
              rel="noreferrer"
              className="text-rhyze-coral underline underline-offset-2"
            >
              studio policies and waiver
            </a>
            . I understand this acceptance is digitally signed and recorded to my account.
            <span className="ml-1 text-rhyze-coral" aria-hidden="true">*</span>
          </span>
        </label>
        <div className="mt-4 border-t border-rhyze-orange/25 pt-4 text-xs font-bold leading-5 text-rhyze-black/70">
          <p className="font-black uppercase tracking-[0.18em] text-rhyze-black">
            Cancellation policy
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Cancel more than 6 hours before class to return the reserved credit with no fee.</li>
            <li>Between 2 and 6 hours, standard clients may reschedule for $5; VIP transfers are free.</li>
            <li>Within 2 hours, standard clients lose the credit and all non-complimentary clients are charged $10.</li>
            <li>No-shows are charged $10 for standard, intro-trial, and VIP clients.</li>
          </ul>
        </div>
      </div>
      <label className="flex items-start gap-3 text-xs font-bold leading-5 text-rhyze-black/65">
        <input
          type="checkbox"
          name="mediaConsent"
          className="mt-1 h-4 w-4 shrink-0 accent-rhyze-coral"
        />
        I agree that Rhyze may use class photos/videos that include me for studio marketing.
      </label>
      <button className="min-h-14 bg-rhyze-gradient px-6 text-sm font-black uppercase tracking-[0.2em]">
        Activate my Rhyze account
      </button>
    </form>
  );
}
