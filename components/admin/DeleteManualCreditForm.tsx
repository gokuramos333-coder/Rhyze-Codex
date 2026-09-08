'use client';

import React from 'react';

type DeleteManualCreditFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  userId: string;
  creditAccountId: string;
  label: string;
};

export function DeleteManualCreditForm({
  action,
  userId,
  creditAccountId,
  label,
}: DeleteManualCreditFormProps) {
  return (
    <form
      action={action}
      className="mt-3 text-right"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Delete “${label}”? This cannot be undone.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <input
        type="hidden"
        name="creditAccountId"
        value={creditAccountId}
      />
      <button
        type="submit"
        className="border border-red-700 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-red-700"
      >
        Delete credit
      </button>
    </form>
  );
}
