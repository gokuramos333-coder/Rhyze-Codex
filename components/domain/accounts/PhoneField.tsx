'use client';
import { useId, useState } from 'react';
import { isValidPhone, PHONE_ERROR } from '@/lib/validation/phone';

export function PhoneField({
  label,
  name,
  defaultValue,
  required = false,
  preserveUnchanged = false,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  preserveUnchanged?: boolean;
}) {
  const id = useId();
  const [error, setError] = useState('');
  function validate(input: HTMLInputElement) {
    const unchanged =
      preserveUnchanged && input.value.trim() === (defaultValue || '').trim();
    const message =
      unchanged || isValidPhone(input.value, !required) ? '' : PHONE_ERROR;
    input.setCustomValidity(message);
    setError(message);
  }
  return (
    <label htmlFor={id} className="grid gap-2 text-sm font-bold">
      {label}
      <input
        aria-label={label}
        id={id}
        name={name}
        type="tel"
        autoComplete="tel"
        required={required}
        maxLength={80}
        defaultValue={defaultValue || ''}
        onChange={(event) => validate(event.currentTarget)}
        onBlur={(event) => validate(event.currentTarget)}
        onInvalid={(event) => validate(event.currentTarget)}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-help`}
        className="min-h-12 w-full border border-black/20 bg-white px-3 font-normal text-rhyze-black"
      />
      <span
        id={`${id}-help`}
        className={
          error ? 'text-sm text-red-800' : 'text-xs text-rhyze-black/60'
        }
      >
        {error || '7–15 digits. Country + and common punctuation accepted.'}
      </span>
    </label>
  );
}
