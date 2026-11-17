'use client';

import React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { specialEventIdentity } from '@/lib/payments/black-friday-new-friend';
import { CheckCircle2, Loader2 } from 'lucide-react';

export function EventCheckoutButton({
  slug,
  occurrenceId,
  soldOut = false,
  waitlistFull = false,
  familyPricing = false,
  specialTicketSalesEnabled = false,
}: {
  slug: string;
  occurrenceId?: string;
  soldOut?: boolean;
  waitlistFull?: boolean;
  familyPricing?: boolean;
  specialTicketSalesEnabled?: boolean;
}) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [childCount, setChildCount] = useState(1);
  const blackFriday = specialTicketSalesEnabled && Boolean(specialEventIdentity(occurrenceId, slug));
  const [ticketType, setTicketType] = useState('SINGLE');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [useEventCredit, setUseEventCredit] = useState(false);
  const [firstVisitDeclared, setFirstVisitDeclared] = useState(false);

  async function beginCheckout() {
    if (soldOut && occurrenceId) {
      window.location.assign(`/member/bookings/new?occurrence=${encodeURIComponent(occurrenceId)}`);
      return;
    }
    if (blackFriday && ticketType === 'PAIR' && (!fullName.trim().includes(' ') || !phone.trim() || !firstVisitDeclared)) {
      setError('Enter your friend’s full name and phone, and confirm this is their first visit.'); return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/checkout/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          occurrenceId,
          ...(familyPricing ? { childCount } : {}),
          ...(blackFriday ? { ticketType, ...(ticketType === 'PAIR' ? { friend: { fullName, phone }, firstVisitDeclared, useEventCredit } : {}) } : {}),
        }),
      });
      const result = await response.json() as { url?: string; error?: string };
      if (response.status === 401) {
        window.location.assign(`/sign-in?callbackUrl=${encodeURIComponent(`/book/event/${slug}${occurrenceId ? `?occurrence=${encodeURIComponent(occurrenceId)}` : ''}`)}`);
        return;
      }
      if (!response.ok || !result.url) {
        setError(result.error || 'Event checkout could not be started.');
        setLoading(false);
        return;
      }
      window.location.assign(result.url);
    } catch {
      setError('We couldn’t confirm the checkout connection. Your details are still here. Check My Bookings before trying again, or contact the studio if you already paid.');
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      {blackFriday && <fieldset className="mb-4 grid gap-3 rounded-xl border border-rhyze-gold/40 p-4">
        <label>Ticket option<select aria-label="Ticket option" value={ticketType} onChange={e=>setTicketType(e.target.value)} className="block min-h-12 w-full bg-rhyze-black p-2">
          <option value="SINGLE">One person — $25</option><option value="CREDIT">Use my VIP event credit</option><option value="PAIR">Me + a NEW friend — $40 total</option>
        </select></label>
        <p role="status" aria-live="polite" className="font-display text-3xl tracking-wide text-rhyze-gold">
          {ticketType === 'PAIR' ? (useEventCredit ? 'One VIP event credit + $15 · 2 spots' : '$40 total · 2 spots') : ticketType === 'CREDIT' ? 'One VIP event credit · 1 spot' : '$25 total · 1 spot'}
        </p>
        {ticketType === 'PAIR' && <>
          <label><input type="checkbox" checked={useEventCredit} onChange={e=>setUseEventCredit(e.target.checked)} /> Use one VIP event credit + pay $15</label>
          <label>Friend’s full name<input required autoComplete="off" value={fullName} onChange={e=>setFullName(e.target.value)} className="block min-h-12 w-full bg-rhyze-black p-2" /></label>
          <label>Friend’s phone<input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} className="block min-h-12 w-full bg-rhyze-black p-2" /></label>
          <label><input required type="checkbox" checked={firstVisitDeclared} onChange={e=>setFirstVisitDeclared(e.target.checked)} /> This is my friend’s first visit</label>
          <p>Reserves exactly two spots. Known returning visitors are not eligible; conflicting history needs staff review. Your friend must claim their own account and accept the waiver before attending. Credits do not roll over.</p>
        </>}
      </fieldset>}
      {familyPricing && (
        <div className="mb-4 rounded-2xl border border-rhyze-gold/35 bg-rhyze-gold/10 p-4">
          <label className="grid gap-2 text-xs font-black uppercase tracking-widest text-rhyze-gold">
            Number of children
            <select
              value={childCount}
              onChange={(event) => setChildCount(Number(event.target.value))}
              className="min-h-12 rounded-lg border border-rhyze-gold/40 bg-rhyze-black px-3 text-base font-bold normal-case tracking-normal text-rhyze-cream"
            >
              {[1, 2, 3, 4, 5].map((count) => (
                <option key={count} value={count}>{count}</option>
              ))}
            </select>
          </label>
          <p className="mt-3 text-sm font-bold text-rhyze-cream/75">
            $30 includes one parent and one child · $5 each additional child
          </p>
          <strong className="mt-2 block font-display text-3xl tracking-wider text-rhyze-gold">
            ${30 + (childCount - 1) * 5} total
          </strong>
        </div>
      )}
      {blackFriday && ticketType === 'CREDIT' && !soldOut ? <>
        <p className="mb-3 text-sm text-rhyze-cream/75">Uses one available VIP event credit. Regular class credits and unlimited class access do not apply. Your VIP eligibility, event-credit balance and waiver are checked before booking.</p>
        <Link href={`/member/bookings/new?occurrence=${encodeURIComponent(occurrenceId!)}`} className="focus-ring flex min-h-14 w-full items-center justify-center rounded-full bg-rhyze-gradient px-6 text-center text-sm font-black uppercase tracking-widest text-rhyze-black">Continue with VIP event credit</Link>
      </> : <button
        type="button"
        onClick={beginCheckout}
        disabled={loading || (soldOut && waitlistFull)}
        className="focus-ring flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-rhyze-gradient px-6 text-sm font-black uppercase tracking-widest text-rhyze-black disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-5 w-5" aria-hidden />}
        {soldOut && waitlistFull ? 'Waitlist Full' : loading ? 'Connecting securely…' : soldOut ? 'Join Waiting List' : 'Confirm Event Booking'}
      </button>}
      {error && <p role="alert" className="mt-3 border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-3 text-sm">{error}</p>}
    </div>
  );
}
