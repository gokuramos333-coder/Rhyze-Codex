'use client';
import React, { useId, useState, useTransition } from 'react';
import {
  TRIAL_UPGRADE_BLOCKER,
  trialUpgradeTerms,
} from '@/lib/domain/memberships/trial-upgrade';

type Product = {
  id: string;
  name: string;
  kind: string;
  billingInterval: string;
  priceCents: number;
  stripePriceId: string | null;
  isActive: boolean;
};
const control =
  'min-h-12 min-w-0 w-full border border-black/20 bg-white px-3 text-sm font-normal';
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function TrialUpgradePanel({
  email,
  products,
}: {
  email: string;
  products: Product[];
}) {
  const id = useId();
  const [productId, setProductId] = useState('');
  const [mode, setMode] = useState('amount');
  const [value, setValue] = useState('');
  const eligible = products.filter(
    (p) =>
      p.isActive &&
      p.billingInterval === 'MONTHLY' &&
      p.stripePriceId &&
      p.priceCents >= 100 &&
      ['LIMITED_MEMBERSHIP', 'MONTHLY_UNLIMITED', 'VIP'].includes(p.kind),
  );
  const selected = eligible.find((p) => p.id === productId);
  let summary = 'Choose a paid plan and enter the first-period price.';
  if (selected) {
    try {
      const terms = trialUpgradeTerms({ mode, value }, selected.priceCents);
      summary = `${dollars(terms.firstCents)} first period; ${dollars(terms.recurringCents)}/month from month 2 onward. Discount applies to the first period only.`;
    } catch (error) {
      summary = (error as Error).message;
    }
  }
  return (
    <section
      className="mt-5 min-w-0 break-words border-t-4 border-rhyze-orange bg-orange-50 p-4"
      aria-label="Trial to paid membership"
    >
      <h3 className="font-display text-3xl">TRIAL TO PAID MEMBERSHIP</h3>
      <p className="mt-2 text-sm">
        Review the paid offer separately from cancelling the trial. Cancelling a
        trial does not purchase a membership.
      </p>
      <div className="mt-4 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4">
        <label className="grid min-w-0 gap-1 text-sm font-bold">
          Paid plan
          <select
            aria-label="Paid plan"
            className={control}
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            aria-describedby={`${id}-plan`}
          >
            <option value="">Choose a paid plan</option>
            {eligible.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {dollars(p.priceCents)}/month
              </option>
            ))}
          </select>
          <span id={`${id}-plan`} className="break-words font-normal">
            {selected
              ? `${selected.name} · regular renewal ${dollars(selected.priceCents)}/month`
              : 'Only eligible monthly paid plans are shown.'}
          </span>
        </label>
        <label className="grid min-w-0 content-start gap-1 text-sm font-bold">
          Customer email
          <input
            type="email"
            className={control}
            defaultValue={email}
            autoComplete="off"
          />
        </label>
        <label className="grid min-w-0 content-start gap-1 text-sm font-bold">
          First period pricing
          <select
            className={control}
            value={mode}
            onChange={(e) => {
              setMode(e.target.value);
              setValue('');
            }}
          >
            <option value="amount">Exact flat amount</option>
            <option value="percent">Explicit percentage discount</option>
          </select>
        </label>
        <label className="grid min-w-0 content-start gap-1 text-sm font-bold">
          {mode === 'amount'
            ? 'First period amount ($)'
            : 'First period discount (%)'}
          <input
            className={control}
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      </div>
      <p
        role="status"
        className="mt-4 break-words border-l-4 border-rhyze-orange bg-white p-3 text-sm font-bold"
      >
        {summary}
      </p>
      <p className="mt-3 text-xs">
        Example: enter $78 as an exact first-period amount for a $92 monthly
        plan. An explicit 15% discount is $78.20.
      </p>
      <p className="mt-3 text-sm">
        Required start policy: paid upfront, with access starting on the
        scheduled first class date within 14 days of purchase, or automatically
        at the 14-day deadline. Recurring renewal must align with that start.
        Studio cancellation does not extend the deadline. Existing active paid
        memberships keep their current terms.
      </p>
      <p className="mt-3 text-sm">
        When available, the customer must enter their card in hosted checkout.
        No saved-card immediate charge or access before confirmed payment.
      </p>
      <p
        id={`${id}-blocker`}
        className="mt-4 border border-amber-700 bg-amber-50 p-3 text-sm font-bold text-amber-950"
      >
        {TRIAL_UPGRADE_BLOCKER}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        {['Create checkout', 'Email checkout'].map((label) => (
          <button
            key={label}
            type="button"
            disabled
            aria-describedby={`${id}-blocker`}
            className="min-h-12 max-w-full bg-black/10 px-4 text-sm font-bold text-black/60"
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs">
        Terms preview only. Nothing is saved or sent.
      </p>
    </section>
  );
}

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
        Trials with trial or ambiguous booking history cannot be cancelled here,
        including past or already cancelled bookings. Pending or active freezes
        also require review. No bookings are removed by this action. Unrelated
        memberships and credits stay in place. No refund, fee or customer email
        is sent; purchase and payment history is retained.
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
