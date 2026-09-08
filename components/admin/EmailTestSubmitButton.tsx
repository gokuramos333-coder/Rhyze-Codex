'use client';

import React from 'react';
import { useFormStatus } from 'react-dom';

export function EmailTestSubmitButtonView({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-4 w-full bg-rhyze-black px-4 py-3 text-xs font-black uppercase text-white hover:bg-rhyze-coral disabled:cursor-wait disabled:bg-rhyze-black/55"
    >
      {pending ? 'Sending test email…' : 'Send test email'}
    </button>
  );
}

export function EmailTestSubmitButton() {
  const { pending } = useFormStatus();
  return <EmailTestSubmitButtonView pending={pending} />;
}
