'use client';

import React, { useState } from 'react';
import { MemberPricingFields } from './MemberPricingFields';
export type MembershipChangeQuote = {
  id: string;
  toName: string;
  chargeCents: number;
  creditCents: number;
  monthlyCents: number;
  effectiveAt: string;
  renewalAt: string;
  timing: string;
  pricingLabel?: string | null;
  existingDiscountLabel?: string | null;
  requiresDiscountReplacement?: boolean;
  resetBillingCycle?: boolean;
};
export type MembershipChangeResult = {
  quote?: MembershipChangeQuote;
  error?: string;
  status?: string;
  message?: string;
};
type Props = {
  userId: string;
  membershipId: string;
  currentProductId: string;
  renewalAt: string;
  today: string;
  products: { id: string; name: string; priceCents: number }[];
  quoteAction: (data: FormData) => Promise<MembershipChangeResult>;
  confirmAction: (data: FormData) => Promise<MembershipChangeResult>;
};
const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    value / 100,
  );
const date = (value: string) =>
  new Date(value).toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

export function AdminMembershipChangeForm(props: Props) {
  const [timing, setTiming] = useState('NEXT_RENEWAL');
  const [result, setResult] = useState<MembershipChangeResult>({});
  const [pending, setPending] = useState(false);
  const [replaceDiscount, setReplaceDiscount] = useState(false);
  async function review(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setResult({});
    setReplaceDiscount(false);
    try {
      setResult(await props.quoteAction(data));
    } catch {
      setResult({
        error:
          'Could not review the change. No billing change was submitted. Try again.',
      });
    } finally {
      setPending(false);
    }
  }
  async function confirm() {
    if (!result.quote || pending) return;
    const data = new FormData();
    data.set('quoteId', result.quote.id);
    data.set('userId', props.userId);
    data.set('replaceExistingDiscount', String(replaceDiscount));
    setPending(true);
    try {
      setResult(await props.confirmAction(data));
    } catch {
      setResult({
        error:
          'Confirmation could not be verified. Refresh this client and check the saved change before trying again.',
      });
    } finally {
      setPending(false);
    }
  }
  const quote = result.quote;
  return (
    <details
      className="mt-4 border border-black/15 bg-white"
      id={`change-${props.membershipId}`}
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-rhyze-orange">
        Change membership
      </summary>
      <div className="space-y-4 border-t border-black/10 p-4 text-sm">
        <p className="text-black/70">
          Choose when the change starts and review the exact Stripe charge.
          Existing bookings stay in place.
        </p>
        {result.message ? (
          <p
            role="status"
            className="border-l-4 border-rhyze-orange bg-orange-50 p-3 font-bold"
          >
            {result.message}
          </p>
        ) : (
          <>
            <form
              onSubmit={review}
              onChange={() => setResult({})}
              className="space-y-3"
            >
              <input type="hidden" name="userId" value={props.userId} />
              <input
                type="hidden"
                name="membershipId"
                value={props.membershipId}
              />
              <fieldset
                disabled={pending}
                className="grid gap-3 disabled:opacity-60 sm:grid-cols-2"
              >
                <label className="grid gap-1 font-bold">
                  New membership
                  <select
                    name="productId"
                    required
                    defaultValue=""
                    className="min-h-11 w-full border border-black/20 bg-white px-2 font-normal"
                  >
                    <option value="" disabled>
                      Select a membership
                    </option>
                    {props.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {money(p.priceCents)}/month
                        {p.id === props.currentProductId ? ' (current)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 font-bold">
                  Start the change
                  <select
                    name="timing"
                    value={timing}
                    onChange={(e) => setTiming(e.target.value)}
                    className="min-h-11 w-full border border-black/20 bg-white px-2 font-normal"
                  >
                    <option value="NEXT_RENEWAL">Next renewal</option>
                    <option value="NOW">Now</option>
                    <option value="DATE">Choose a date</option>
                  </select>
                </label>
                {timing === 'DATE' && (
                  <div className="grid gap-1 sm:col-span-2">
                    <label className="grid gap-1 font-bold">
                      Start date (Eastern time)
                      <input
                        aria-describedby={`date-help-${props.membershipId}`}
                        name="date"
                        type="date"
                        required
                        min={props.today}
                        max={props.renewalAt.slice(0, 10)}
                        className="min-h-11 w-full border border-black/20 px-2 font-normal"
                      />
                    </label>
                    <p
                      id={`date-help-${props.membershipId}`}
                      className="text-xs text-black/60"
                    >
                      Choose a future day in this paid period. For the renewal
                      itself, select “Next renewal.”
                    </p>
                  </div>
                )}
                {timing === 'NOW' && (
                  <label className="flex items-start gap-3 sm:col-span-2">
                    <input
                      type="checkbox"
                      name="resetBillingCycle"
                      value="true"
                      className="mt-1"
                    />
                    <span>
                      Start a new paid month today. Charge the full monthly
                      price and reset the renewal date. Unused days on the old
                      plan will not be credited. Leave unchecked to charge only
                      the prorated difference.
                    </span>
                  </label>
                )}
                <MemberPricingFields />
                <p className="text-xs text-black/60 sm:col-span-2">
                  Review prepares a quote and, when needed, an unapplied Stripe
                  discount. It does not charge. For a price-only change to the
                  current plan, choose Next renewal.
                </p>
                <button
                  disabled={pending}
                  className="min-h-11 bg-rhyze-black px-4 py-3 font-bold text-white disabled:opacity-50 sm:col-span-2"
                >
                  {pending ? 'Checking…' : 'Review change'}
                </button>
              </fieldset>
            </form>
            {quote && (
              <section
                aria-label="Review membership change"
                className="space-y-3 border-l-4 border-rhyze-orange bg-orange-50 p-4"
              >
                <h4 className="font-bold">
                  {quote.toName} — {money(quote.monthlyCents)}/month
                </h4>
                {quote.pricingLabel && (
                  <p className="font-bold">{quote.pricingLabel}</p>
                )}
                {quote.requiresDiscountReplacement && (
                  <label className="flex items-start gap-3 border border-orange-300 bg-white p-3">
                    <input
                      type="checkbox"
                      checked={replaceDiscount}
                      onChange={(e) => setReplaceDiscount(e.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      Replace existing promotion:{' '}
                      <strong>{quote.existingDiscountLabel}</strong>. The new
                      client price above replaces this promotion; discounts will
                      not stack.
                    </span>
                  </label>
                )}
                <p>
                  Starts {date(quote.effectiveAt)}.{' '}
                  {quote.resetBillingCycle
                    ? 'A full paid month starts today; future renewals follow this new monthly date. Unused old-plan days are not credited.'
                    : `Renewal stays ${date(quote.renewalAt)}.`}
                </p>
                <p className="font-bold">
                  {quote.creditCents > 0
                    ? `${money(quote.creditCents)} Stripe billing credit`
                    : `${money(quote.chargeCents)} ${quote.timing === 'NEXT_RENEWAL' ? 'due at renewal' : quote.timing === 'NOW' ? 'due for this change' : 'estimated due on the start date'}`}
                </p>
                <p className="text-xs text-black/70">
                  A billing credit reduces future invoices; it is not a card
                  refund. The first invoice may include that credit. Future full
                  months use the reviewed client price for the chosen duration,
                  then the regular plan price. New access starts after payment
                  succeeds.{' '}
                  {quote.resetBillingCycle
                    ? 'Standard class access starts for the new paid month. VIP event benefits remain limited to one per calendar month.'
                    : 'Credits already used this month are not granted again.'}
                </p>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={
                    pending ||
                    (!!quote.requiresDiscountReplacement && !replaceDiscount)
                  }
                  className="min-h-11 w-full bg-rhyze-black px-4 py-3 font-bold text-white disabled:opacity-50"
                >
                  {pending ? 'Confirming…' : 'Confirm membership change'}
                </button>
              </section>
            )}
          </>
        )}
        {result.error && (
          <p
            role="alert"
            className="border-l-4 border-red-600 bg-red-50 p-3 font-bold text-red-800"
          >
            {result.error}
          </p>
        )}
      </div>
    </details>
  );
}

export function AdminMembershipChangeRecovery({
  userId,
  quoteId,
  action,
}: {
  userId: string;
  quoteId: string;
  action: (data: FormData) => Promise<MembershipChangeResult>;
}) {
  const [result, setResult] = useState<MembershipChangeResult>({});
  const [pending, setPending] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        className="min-h-11 border border-black px-3 py-2 font-bold disabled:opacity-50"
        onClick={async () => {
          setPending(true);
          const data = new FormData();
          data.set('userId', userId);
          data.set('quoteId', quoteId);
          try {
            setResult(await action(data));
          } catch {
            setResult({
              error:
                'Could not verify the saved change. Check Stripe before another billing action.',
            });
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? 'Verifying…' : 'Verify / retry saved change'}
      </button>
      {result.error && (
        <p role="alert" className="mt-2 font-bold text-red-800">
          {result.error}
        </p>
      )}
      {result.message && (
        <p role="status" className="mt-2">
          {result.message}
        </p>
      )}
    </div>
  );
}
