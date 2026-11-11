'use client';
import React, { useState, useTransition } from 'react';

const control =
  'min-h-12 min-w-0 w-full border border-black/20 bg-white px-3 text-sm font-normal';

export function CancelIntroTrialForm({
  userId,
  membershipId,
  action,
  blocker,
}: {
  userId: string;
  membershipId: string;
  action: (form: FormData) => void | Promise<void>;
  blocker?: string;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(form) =>
        startTransition(async () => {
          if (blocker) return;
          await action(form);
        })
      }
      className="mt-4 min-w-0 border border-red-800/30 bg-red-50 p-4"
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <h3 className="text-sm font-black">Cancel 7-day intro trial</h3>
      <p className="mt-2 text-sm">
        Trial access ends immediately and queued trial-ending reminders stop.
        Active or paused trials with proven historical booking funding can be
        cancelled. All past bookings and attendance are preserved. Ambiguous
        funding, future trial bookings, replacement credits, and pending or
        active freezes require review. No bookings are removed by this action.
        Unrelated memberships and credits stay in place. No refund, fee or
        customer email is sent; purchase and payment history is retained.
      </p>
      {blocker && (
        <p role="alert" className="mt-3 text-sm font-bold">
          {blocker}
        </p>
      )}
      <label className="mt-3 grid min-w-0 gap-1 text-sm font-bold">
        Cancellation reason
        <input
          name="reason"
          className={control}
          minLength={3}
          maxLength={240}
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="confirmed"
          required
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1 shrink-0"
        />
        I confirm immediate trial cancellation without changing any bookings.
      </label>
      <button
        disabled={
          Boolean(blocker) || !confirmed || reason.trim().length < 3 || pending
        }
        className="mt-3 min-h-12 max-w-full bg-red-800 px-4 text-sm font-bold text-white disabled:opacity-40"
      >
        {pending ? 'Cancelling…' : 'Cancel trial'}
      </button>
    </form>
  );
}
