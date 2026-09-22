import React from 'react';
import { identityErrorMessage } from '@/lib/domain/accounts/account-identity-service';

export function AccountIdentityForm({
  name,
  email,
  reauthenticate = true,
  userId,
  nameAction,
  emailAction,
  error,
  saved,
}: {
  name: string | null;
  email: string;
  reauthenticate?: boolean;
  userId?: string;
  nameAction?: (form: FormData) => Promise<void>;
  emailAction?: (form: FormData) => Promise<void>;
  error?: string;
  saved?: string;
}) {
  const field =
    'min-h-12 w-full border border-black/20 bg-white px-3 text-base font-normal normal-case';
  const button =
    'min-h-12 bg-rhyze-black px-5 text-xs font-black uppercase tracking-[0.2em] text-rhyze-cream';
  return (
    <section className="mt-6 min-w-0 border-t-4 border-rhyze-coral bg-white p-5">
      <h2 className="font-display text-4xl tracking-wider">ACCOUNT DETAILS</h2>
      {error && (
        <p
          role="alert"
          className="mt-4 border-l-4 border-rhyze-coral bg-orange-50 p-3 text-sm font-bold"
        >
          {identityErrorMessage(error)}
        </p>
      )}
      {saved === 'name' && (
        <p role="status" className="mt-4 text-sm font-bold">
          Account name saved.
        </p>
      )}
      {saved === 'email' && (
        <p role="status" className="mt-4 text-sm font-bold">
          Confirmation requested. Check the new email inbox. Your login has not
          changed.
        </p>
      )}
      <form action={nameAction} className="mt-5 grid gap-4">
        {userId && <input type="hidden" name="userId" value={userId} />}
        <label className="grid gap-2 text-xs font-black uppercase tracking-widest">
          Account name
          <input
            name="name"
            autoComplete="name"
            defaultValue={name || ''}
            required
            maxLength={120}
            className={field}
          />
        </label>
        <button className={button}>Save account name</button>
      </form>
      <form
        action={emailAction}
        className="mt-6 grid gap-4 border-t border-black/10 pt-5"
      >
        {userId && <input type="hidden" name="userId" value={userId} />}
        <p className="break-all text-sm">
          Current login: <strong>{email}</strong>
        </p>
        <p className="text-sm text-rhyze-black/60">
          The old email stays active until the new address is confirmed. The
          link expires in one hour. Confirmation signs out existing sessions and
          preserves all account history.
        </p>
        <label className="grid gap-2 text-xs font-black uppercase tracking-widest">
          New email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            className={field}
          />
        </label>
        {reauthenticate && (
          <label className="grid gap-2 text-xs font-black uppercase tracking-widest">
            Current password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
              className={field}
            />
          </label>
        )}
        <button className={button}>Send confirmation</button>
      </form>
    </section>
  );
}
