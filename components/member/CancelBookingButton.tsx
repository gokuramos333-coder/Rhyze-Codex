'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { CancellationPolicyDecision } from '@/lib/domain/bookings/cancellation-policy';

export function CancelBookingButton({
  bookingId,
  decision,
  action,
}: {
  bookingId: string;
  decision: CancellationPolicyDecision;
  action: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const title = decision.action === 'RESCHEDULE'
    ? 'Reschedule this class?'
    : decision.requiresAcknowledgement
      ? 'Cancel this event?'
      : 'Cancel this class?';

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAcknowledged(false);
          setOpen(true);
        }}
        className="border border-rhyze-coral px-4 py-2 text-xs font-black uppercase tracking-widest text-rhyze-coral"
      >
        Cancel
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-rhyze-black/70 p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`cancel-booking-title-${bookingId}`}
            className="w-full max-w-lg border-t-4 border-rhyze-orange bg-white p-6 shadow-2xl"
          >
            <p className="text-xs font-black uppercase tracking-[0.25em] text-rhyze-coral">
              Attendance policy
            </p>
            <h2
              id={`cancel-booking-title-${bookingId}`}
              className="mt-2 font-display text-4xl tracking-wider"
            >
              {title}
            </h2>
            <p className="mt-4 text-sm font-bold leading-6 text-rhyze-black/70">
              {decision.message}
            </p>
            {decision.requiresAcknowledgement && (
              <label className="mt-5 flex gap-3 border-2 border-rhyze-orange bg-rhyze-orange/10 p-4 text-sm font-black leading-6 text-rhyze-black">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-1 h-5 w-5 flex-none accent-rhyze-orange"
                />
                <span>
                  I understand this event cancellation policy and the 30-day rebooking rule.
                </span>
              </label>
            )}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                autoFocus
                onClick={() => setOpen(false)}
                className="min-h-12 border border-rhyze-black px-5 text-xs font-black uppercase tracking-widest"
              >
                Keep my class
              </button>
              {decision.action === 'RESCHEDULE' ? (
                <Link
                  href={`/member/bookings/reschedule?booking=${bookingId}`}
                  className="flex min-h-12 items-center justify-center bg-rhyze-gradient px-5 text-center text-xs font-black uppercase tracking-widest"
                >
                  {decision.confirmLabel}
                </Link>
              ) : (
                <form action={action}>
                  <input type="hidden" name="bookingId" value={bookingId} />
                  <button
                    disabled={decision.requiresAcknowledgement && !acknowledged}
                    className="min-h-12 w-full bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40">
                    {decision.confirmLabel}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
