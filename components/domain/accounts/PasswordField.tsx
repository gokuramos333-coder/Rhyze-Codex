'use client';

import React, { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function PasswordField({
  label,
  name,
  autoComplete = 'new-password',
}: {
  label: string;
  name: string;
  autoComplete?: string;
}) {
  const [shown, setShown] = useState(false);
  const inputId = useId();

  return (
    <div className="grid gap-2">
      <label htmlFor={inputId} className="text-xs font-black uppercase tracking-[0.22em] text-rhyze-black/65">
        {label}<span className="ml-1 text-rhyze-coral" aria-hidden="true">*</span>
      </label>
      <span className="relative">
        <input
          id={inputId}
          required
          name={name}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          className="focus-ring min-h-14 w-full border border-rhyze-black/20 bg-white px-4 pr-14 text-base outline-none focus:border-rhyze-coral"
        />
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={shown}
          className="focus-ring absolute inset-y-0 right-0 grid w-14 place-items-center text-rhyze-black/55"
        >
          {shown ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
        </button>
      </span>
    </div>
  );
}
