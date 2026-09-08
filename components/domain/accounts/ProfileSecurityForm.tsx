'use client';

import React from 'react';
import { PasswordField } from './PasswordField';

export function ProfileSecurityForm({
  email,
  action,
}: {
  email: string;
  action?: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <section className="mt-6 border-t-4 border-rhyze-orange bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-rhyze-orange">
        Account &amp; security
      </p>
      <h2 className="mt-2 font-display text-4xl tracking-wider">
        YOUR SIGN-IN
      </h2>
      <div className="mt-5 border border-rhyze-orange/30 bg-orange-50 p-4">
        <span className="block text-xs font-black uppercase tracking-widest text-rhyze-black/55">
          Account email
        </span>
        <strong className="mt-1 block break-all">{email}</strong>
      </div>
      <form action={action} className="mt-5 grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <PasswordField
            label="Current password"
            name="currentPassword"
            autoComplete="current-password"
          />
        </div>
        <PasswordField label="New password" name="newPassword" />
        <PasswordField
          label="Confirm new password"
          name="passwordConfirmation"
        />
        <p className="text-xs text-rhyze-black/55 md:col-span-2">
          Use at least 9 characters with an uppercase letter, number, and symbol.
          You will remain signed in after this change.
        </p>
        <button className="min-h-12 bg-rhyze-black px-5 text-xs font-black uppercase tracking-[0.2em] text-rhyze-cream md:col-span-2">
          Change password
        </button>
      </form>
    </section>
  );
}
