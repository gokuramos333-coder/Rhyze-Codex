import React from 'react';
import { birthdayMonthDay } from '@/lib/domain/birthdays/birthday-reminders';

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function BirthdayFields({
  value,
  className = '',
}: {
  value?: Date | null;
  className?: string;
}) {
  const selected = birthdayMonthDay(value);
  const inputClassName =
    'focus-ring min-h-14 w-full border border-rhyze-black/20 bg-white px-4 text-base outline-none focus:border-rhyze-coral';

  return (
    <fieldset className={className}>
      <legend className="text-xs font-black uppercase tracking-[0.22em] text-rhyze-black/65">
        Birthday <span className="text-rhyze-coral" aria-hidden="true">*</span>
      </legend>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <label className="grid gap-1.5 text-xs font-bold text-rhyze-black/60">
          Birthday month
          <select
            name="birthdayMonth"
            required
            defaultValue={selected.month || ''}
            className={inputClassName}
          >
            <option value="" disabled>Month</option>
            {months.map((month, index) => (
              <option key={month} value={index + 1}>{month}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-bold text-rhyze-black/60">
          Birthday day
          <select
            name="birthdayDay"
            required
            defaultValue={selected.day || ''}
            className={inputClassName}
          >
            <option value="" disabled>Day</option>
            {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-2 text-xs font-bold text-rhyze-black/50">
        No year needed. We use this to celebrate upcoming birthdays and help
        management send your free standard class.
      </p>
    </fieldset>
  );
}
