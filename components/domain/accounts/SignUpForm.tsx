'use client';

import { signUpAction } from '@/app/(auth)/actions';
import { AuthField } from './AuthFrame';
import { PasswordField } from './PasswordField';
import { BirthdayFields } from './BirthdayFields';

export function SignUpForm({
  callbackUrl = '',
}: {
  callbackUrl?: string;
}) {
  return (
    <form action={signUpAction} className="mt-8 grid gap-5">
      {callbackUrl && (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <AuthField label="First name" name="firstName" autoComplete="given-name" showRequiredIndicator />
        <AuthField label="Last name" name="lastName" autoComplete="family-name" showRequiredIndicator />
      </div>
      <AuthField label="Email address" name="email" type="email" autoComplete="email" showRequiredIndicator />
      <AuthField label="Cell phone" name="phone" type="tel" autoComplete="tel" showRequiredIndicator />
      <BirthdayFields />
      <PasswordField
        label="Password"
        name="password"
      />
      <PasswordField
        label="Confirm password"
        name="passwordConfirmation"
      />
      <p className="-mt-1 text-xs leading-5 text-rhyze-black/50">
        Use at least 9 characters with an uppercase letter, number, and symbol.
      </p>
      <div className="border-4 border-rhyze-coral bg-rhyze-coral/10 p-5 shadow-xl">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-rhyze-coral">
          Required signature box
        </p>
        <h3 className="mt-2 font-display text-3xl tracking-wider">
          Check this box to create your account
        </h3>
        <label className="mt-4 flex cursor-pointer items-start gap-4 border-2 border-rhyze-coral bg-white p-4 shadow-sm">
          <input
            required
            type="checkbox"
            name="waiverAccepted"
            className="mt-1 h-7 w-7 shrink-0 accent-rhyze-coral"
          />
          <span className="text-base font-black leading-7">
            I have reviewed and accept the required Rhyze Fitness{' '}
            <a
              href="/policies"
              target="_blank"
              rel="noreferrer"
              className="text-rhyze-coral underline underline-offset-2"
            >
              studio policies, waiver, and cancellation policy
            </a>
            . I understand this acceptance is digitally signed and recorded to my account.
            <span className="ml-1 text-rhyze-coral" aria-hidden="true">*</span>
          </span>
        </label>
        <div className="mt-4 border-t border-rhyze-coral/25 pt-4 text-xs font-bold leading-5 text-rhyze-black/70">
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
      <button className="min-h-14 bg-rhyze-gradient px-6 text-sm font-black uppercase tracking-[0.2em] text-rhyze-black">
        Create My Rhyze
      </button>
    </form>
  );
}
