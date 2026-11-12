'use client';
import { useState, useTransition } from 'react';
import type { ClientArchiveState } from '@/lib/domain/accounts/client-archive';

export function ClientArchiveControls({
  userId,
  state,
  action,
}: {
  userId: string;
  state: ClientArchiveState;
  action: (form: FormData) => Promise<{ ok: boolean; message: string }>;
}) {
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  return (
    <section className="mt-6 border-t-4 border-rhyze-gold bg-white p-5">
      <h2 className="font-display text-3xl">Client directory</h2>
      <p className="mt-2 text-sm">
        Archive hides this client from the default directory. Account access and
        all history are preserved. Active billing, credits or future bookings
        keep the client visible.
      </p>
      <p className="mt-2 text-sm font-bold">
        {state.effectivelyArchived
          ? 'Archived'
          : state.archived
            ? 'Visible again because obligations need attention.'
            : 'Visible in the directory'}
      </p>
      {state.reasons.length > 0 && (
        <p className="mt-2 text-sm">
          Archive unavailable: {state.reasons.join('; ')}.
        </p>
      )}
      <form
        action={(form) =>
          startTransition(async () => {
            try {
              setMessage((await action(form)).message);
            } catch {
              setMessage(
                'Change not confirmed. Refresh the client record before trying again.',
              );
            }
          })
        }
        className="mt-4"
      >
        <input type="hidden" name="userId" value={userId} />
        <input
          type="hidden"
          name="operation"
          value={state.archived ? 'restore' : 'archive'}
        />
        <button
          disabled={pending || (!state.archived && state.reasons.length > 0)}
          className="min-h-12 border border-black/20 px-5 text-sm font-bold disabled:opacity-40"
        >
          {pending
            ? 'Saving…'
            : state.archived
              ? 'Restore client'
              : 'Archive client'}
        </button>
      </form>
      {message && (
        <p role="status" className="mt-3 text-sm font-bold">
          {message}
        </p>
      )}
    </section>
  );
}
