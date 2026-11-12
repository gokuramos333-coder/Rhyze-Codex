'use client';
import React, { useRef, useState, useTransition } from 'react';
import { giftKindLabels } from '@/lib/domain/credits/gift-credit';
export function MemberGiftForm({
  userId,
  memberName,
  requestId,
  defaultExpiry,
  action,
}: {
  userId: string;
  memberName: string;
  requestId: string;
  defaultExpiry: string;
  action: (form: FormData) => Promise<{ ok: boolean; message: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const key = useRef(requestId);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const control =
    'min-h-11 w-full min-w-0 border border-black/20 bg-white px-3 text-sm';
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || result?.ok) return;
        const form = new FormData(event.currentTarget);
        startTransition(async () => {
          if (result?.ok) return;
          try {
            setResult(await action(form));
          } catch {
            setResult({
              ok: false,
              message:
                'Connection interrupted. Check gift history, or retry this unchanged form safely.',
            });
          }
        });
      }}
      className="mt-4 border border-rhyze-gold/40 bg-yellow-50 p-4"
    >
      <h3 className="font-display text-3xl">GIVE A GIFT CREDIT</h3>
      <p className="mt-2 text-sm">
        Add one complimentary credit to {memberName} for a birthday, milestone
        or your own reason.
      </p>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="requestId" value={key.current} />
      <fieldset
        disabled={pending || result?.ok}
        className="mt-4 grid min-w-0 gap-3 md:grid-cols-3"
      >
        <label className="grid gap-1 text-sm font-bold">
          Gift can be used for
          <select name="kind" className={control} defaultValue="CLASS">
            {Object.entries(giftKindLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Occasion
          <select name="occasion" className={control}>
            <option>Birthday</option>
            <option>Milestone</option>
            <option>Other</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-bold">
          Use through (New Jersey)
          <input
            name="expirationDate"
            type="date"
            required
            defaultValue={defaultExpiry}
            className={control}
          />
        </label>
        <label className="grid gap-1 text-sm font-bold md:col-span-3">
          Reason — visible to the member
          <input
            name="reason"
            minLength={3}
            maxLength={200}
            required
            placeholder="Happy birthday! Enjoy a class on us."
            className={control}
          />
        </label>
        <p className="text-sm md:col-span-3">
          Class or event means ONE shared credit, not one of each. The booked
          class or event must start by the expiration date. Normal cancellation
          rules apply. No payment, subscription change or email is created.
        </p>
        <button className="min-h-11 bg-rhyze-black px-4 text-sm font-bold text-white disabled:opacity-50">
          {pending ? 'Adding gift…' : 'Add 1 gift credit'}
        </button>
      </fieldset>
      {result && (
        <p
          role={result.ok ? 'status' : 'alert'}
          className="mt-3 text-sm font-bold"
        >
          {result.message}
        </p>
      )}
      {result?.ok && (
        <p className="mt-2 text-sm">
          Gift saved. Reload the page only if you intend to give another gift.
        </p>
      )}
    </form>
  );
}
