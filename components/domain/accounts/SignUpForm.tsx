'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { signUpAction } from '@/app/(auth)/actions';
import { AuthField } from './AuthFrame';

export function SignUpForm({
  defaultReferral = '',
  callbackUrl = '',
}: {
  defaultReferral?: string;
  callbackUrl?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  return (
    <form action={signUpAction} className="mt-8 grid gap-5">
      {callbackUrl && (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      )}
      <AuthField label="Full name" name="name" autoComplete="name" showRequiredIndicator />
      <AuthField label="Email address" name="email" type="email" autoComplete="email" showRequiredIndicator />
      <AuthField label="Phone number" name="phone" type="tel" autoComplete="tel" showRequiredIndicator />
      <PasswordField
        label="Password"
        name="password"
        shown={showPassword}
        onToggle={() => setShowPassword((value) => !value)}
      />
      <PasswordField
        label="Confirm password"
        name="passwordConfirmation"
        shown={showConfirmation}
        onToggle={() => setShowConfirmation((value) => !value)}
      />
      <p className="-mt-1 text-xs leading-5 text-rhyze-black/50">
        Use at least 9 characters with an uppercase letter, number, and symbol.
      </p>
      <label className="grid gap-2">
        <span className="text-xs font-black uppercase tracking-[0.22em] text-rhyze-black/65">
          Referral code <span className="text-[9px] tracking-[0.14em] text-rhyze-black/40">(Optional)</span>
        </span>
        <input name="referralCode" defaultValue={defaultReferral} autoComplete="off" className="focus-ring min-h-14 border border-rhyze-black/20 bg-white px-4 text-base outline-none focus:border-rhyze-coral"/>
      </label>
      <label className="grid gap-2">
        <span className="text-xs font-black uppercase tracking-[0.22em] text-rhyze-black/65">
          RHYZE INSTRUCTOR? ENTER CODE HERE{' '}
          <span className="text-[9px] tracking-[0.14em] text-rhyze-black/40">(Optional)</span>
        </span>
        <input name="instructorCode" autoComplete="off" className="focus-ring min-h-14 border border-rhyze-black/20 bg-white px-4 text-base outline-none focus:border-rhyze-coral"/>
      </label>
      <button className="min-h-14 bg-rhyze-gradient px-6 text-sm font-black uppercase tracking-[0.2em] text-rhyze-black">
        Create My Rhyze
      </button>
    </form>
  );
}

function PasswordField({
  label,
  name,
  shown,
  onToggle,
}: {
  label: string;
  name: string;
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-black uppercase tracking-[0.22em] text-rhyze-black/65">
        {label}<span className="ml-1 text-rhyze-coral" aria-hidden="true">*</span>
      </span>
      <span className="relative">
        <input
          required
          name={name}
          type={shown ? 'text' : 'password'}
          autoComplete="new-password"
          className="focus-ring min-h-14 w-full border border-rhyze-black/20 bg-white px-4 pr-14 text-base outline-none focus:border-rhyze-coral"
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="focus-ring absolute inset-y-0 right-0 grid w-14 place-items-center text-rhyze-black/55"
        >
          {shown ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </span>
    </label>
  );
}
