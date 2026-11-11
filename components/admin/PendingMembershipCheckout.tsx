'use client';

import { useState, useTransition } from 'react';

export type PendingCheckoutOffer = {
  id: string;
  name: string;
  amountCents: number;
  pricingLabel: string;
  createdAt: string;
  hasSession: boolean;
};
export function PendingMembershipCheckout({ userId, offer, action }: {
  userId: string;
  offer: PendingCheckoutOffer;
  action: (data: FormData) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();
  return <section className="mb-4 min-w-0 border border-amber-300 bg-amber-50 p-4" aria-label="Unfinished membership checkout">
    <h3 className="font-black">Unfinished membership checkout</h3>
    <p className="mt-2 break-words font-bold">{offer.name}</p>
    <p className="text-sm">Saved offer: ${(offer.amountCents / 100).toFixed(2)} initial payment</p>
    <p className="break-words text-sm">{offer.pricingLabel}</p>
    <p className="mt-1 text-xs">Created {offer.createdAt}. Pending checkout is not proof of payment.</p>
    <p className="mt-3 text-sm">Cancellation stops only this unpaid payment link. It does not charge the client, cancel an existing membership, change trial access, or send an email.</p>
    <p className="mt-2 text-sm">After cancellation is verified, review pricing and manually create a new checkout. No replacement is created automatically.</p>
    {!offer.hasSession ? <p role="alert" className="mt-3 text-sm font-bold">The provider link has not been saved. Staff review is required; do not create a replacement yet.</p> : !confirming ?
      <button type="button" className="mt-3 min-h-11 border border-black px-3 py-2 text-sm font-bold" onClick={() => setConfirming(true)}>Cancel unfinished checkout</button> :
      <form className="mt-4 grid min-w-0 gap-3" onSubmit={event => {
        event.preventDefault();
        if (pending || !confirmed || reason.trim().length < 3) return;
        const data = new FormData();
        data.set('userId', userId); data.set('purchaseId', offer.id); data.set('reason', reason.trim()); data.set('confirmed', 'yes');
        startTransition(async () => { await action(data); });
      }}>
        <label className="text-sm font-bold">Cancellation reason
          <input className="mt-1 min-h-11 w-full min-w-0 border border-black/30 bg-white p-2" value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={240} required disabled={pending} />
        </label>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required disabled={pending} />Stop this unpaid payment link only. I will create any corrected checkout separately.</label>
        <div className="flex flex-wrap gap-2">
          <button className="min-h-11 bg-rhyze-black px-3 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={pending || !confirmed || reason.trim().length < 3}>{pending ? 'Checking checkout…' : 'Confirm cancellation'}</button>
          <button type="button" className="min-h-11 border border-black px-3 py-2 text-sm" disabled={pending} onClick={() => { setConfirming(false); setConfirmed(false); }}>Keep checkout</button>
        </div>
      </form>}
  </section>;
}
