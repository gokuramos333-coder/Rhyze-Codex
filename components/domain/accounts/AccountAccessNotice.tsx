import React from 'react';

export function AccountAccessNotice({
  claimed = false,
  reset = false,
}: {
  claimed?: boolean;
  reset?: boolean;
}) {
  if (!claimed && !reset) return null;
  return (
    <p className="mt-5 border-l-4 border-emerald-600 bg-emerald-50 p-4 text-sm font-bold">
      {claimed
        ? 'Your My Rhyze account is activated. Sign in with the password you just chose.'
        : 'Password updated. Sign in with your new password.'}
    </p>
  );
}
