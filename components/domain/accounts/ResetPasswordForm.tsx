'use client';

import React from 'react';
import { PasswordField } from './PasswordField';

export function ResetPasswordForm({
  token,
  action,
}: {
  token: string;
  action?: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={action} className="mt-8 grid gap-5">
      <input type="hidden" name="token" value={token} />
      <PasswordField label="New password" name="password" />
      <PasswordField
        label="Confirm new password"
        name="passwordConfirmation"
      />
      <p className="text-xs text-rhyze-black/55">
        Use at least 9 characters with an uppercase letter, number, and symbol.
      </p>
      <button className="min-h-14 bg-rhyze-gradient px-6 text-sm font-black uppercase tracking-[0.2em]">
        Save new password
      </button>
    </form>
  );
}
