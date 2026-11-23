'use client';

import { useState } from 'react';
import Link from 'next/link';
import { normalizeFriendPhone, specialEventIdentity } from '@/lib/payments/black-friday-new-friend';
import { ArrowRight, Loader2 } from 'lucide-react';
import { eventCheckoutWaiverDestination } from '@/lib/domain/waivers/acceptance';

const ticketField = 'focus-ring mt-1 block min-h-12 w-full rounded-lg border border-white/20 bg-rhyze-black px-3 text-base text-rhyze-cream';
const primaryButton = 'focus-ring flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-rhyze-gradient px-6 text-center text-sm font-black uppercase tracking-widest text-rhyze-black disabled:opacity-60';

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
  const [needsWaiver, setNeedsWaiver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [childCount, setChildCount] = useState(1);
  const offer = specialTicketSalesEnabled ? specialEventIdentity(occurrenceId, slug) : undefined;
  const [ticketType, setTicketType] = useState('SINGLE');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [useEventCredit, setUseEventCredit] = useState(false);
  const [firstVisitDeclared, setFirstVisitDeclared] = useState(false);

  const vipPairCash = offer?.vipPairCashCents;
  const bookingHref = `/member/bookings/new?occurrence=${encodeURIComponent(occurrenceId ?? '')}`;

  async function beginCheckout() {
    if (soldOut && occurrenceId) {
      window.location.assign(bookingHref);
      return;
    }
    const name = fullName.trim().replace(/\s+/g, ' ');
    const friendPhone = phone.trim();
    if (offer && ticketType === 'PAIR') {
      if (!name.includes(' ') || name.length > 120 || !normalizeFriendPhone(friendPhone)) {
        setError('Enter your friend’s full name and a valid phone number.');
        return;
      }
      if (offer.requiresFirstVisit && !firstVisitDeclared) {
        setError('Confirm this is your friend’s first visit.');
        return;
      }
    }
    setLoading(true);
    setError('');
    setNeedsWaiver(false);
    try {
      const response = await fetch('/api/checkout/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          occurrenceId,
          ...(familyPricing ? { childCount } : {}),
          ...(offer ? { ticketType } : {}),
          ...(offer && ticketType === 'PAIR' ? {
            friend: { fullName: name, phone: friendPhone },
            ...(offer.requiresFirstVisit ? { firstVisitDeclared } : {}),
            ...(vipPairCash && useEventCredit ? { useEventCredit: true } : {}),
          } : {}),
        }),
      });
      const result = await response.json() as { url?: string; waiverUrl?: string };
      if (response.status === 401) {
        window.location.assign(`/sign-in?callbackUrl=${encodeURIComponent(`/book/event/${slug}${occurrenceId ? `?occurrence=${encodeURIComponent(occurrenceId)}` : ''}`)}`);
        return;
      }
      if (!response.ok || !result.url) {
        const waiverRequired = response.status === 403 && Boolean(result.waiverUrl);
        setNeedsWaiver(waiverRequired);
        setError(waiverRequired
          ? 'Please sign the studio waiver before buying your ticket.'
          : 'We couldn’t start checkout. Check My Bookings or contact the studio for help.');
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
      {offer && !soldOut && (
        <fieldset disabled={loading} className="mb-4 grid gap-4 rounded-xl border border-white/15 p-4">
          <label className="text-sm font-semibold">
            Ticket option
            <select value={ticketType} onChange={(event) => { setTicketType(event.target.value); setError(''); }} className={ticketField}>
              <option value="SINGLE">One person — ${offer.singlePriceCents / 100}</option>
              <option value="PAIR">Me + a {offer.requiresFirstVisit ? 'NEW ' : ''}friend — ${offer.pairPriceCents / 100} total</option>
              <option value="CREDIT">Use my VIP event credit</option>
            </select>
          </label>
          <p role="status" aria-live="polite" className="font-display text-3xl tracking-wide text-rhyze-gold">
            {ticketType === 'PAIR'
              ? `${useEventCredit && vipPairCash ? `One VIP event credit + $${vipPairCash / 100}` : `$${offer.pairPriceCents / 100} total`} · 2 spots`
              : ticketType === 'CREDIT' ? 'One VIP event credit · 1 spot' : `$${offer.singlePriceCents / 100} total · 1 spot`}
          </p>
          {ticketType === 'PAIR' && (
            <>
              <label className="text-sm font-semibold">
                Friend’s full name
                <input required autoComplete="off" maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)} className={ticketField} />
              </label>
              <label className="text-sm font-semibold">
                Friend’s phone
                <input required type="tel" autoComplete="off" maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value)} className={ticketField} />
              </label>
              {offer.requiresFirstVisit && (
                <label className="flex items-start gap-2 text-sm">
                  <input required type="checkbox" className="mt-0.5 h-4 w-4 accent-rhyze-gold" checked={firstVisitDeclared} onChange={(event) => setFirstVisitDeclared(event.target.checked)} />
                  This is my friend’s first visit
                </label>
              )}
              {vipPairCash && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-rhyze-gold" checked={useEventCredit} onChange={(event) => setUseEventCredit(event.target.checked)} />
                  Use one VIP event credit + pay ${vipPairCash / 100}
                </label>
              )}
              <p className="text-sm text-rhyze-cream/75">Each attendee needs a signed waiver.</p>
            </>
          )}
        </fieldset>
      )}
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
      {offer && ticketType === 'CREDIT' && !soldOut ? (
        <Link href={bookingHref} className={primaryButton}>Continue with VIP event credit</Link>
      ) : (
        <button type="button" onClick={beginCheckout} disabled={loading || (soldOut && waitlistFull)} className={primaryButton}>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ArrowRight className="h-5 w-5" aria-hidden />}
          {soldOut && waitlistFull ? 'Waitlist Full' : loading ? 'Connecting securely…' : soldOut ? 'Join Waiting List' : 'Continue to payment'}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-3 text-sm">
          {error}
          {needsWaiver && <Link href={eventCheckoutWaiverDestination(slug)} className="ml-2 underline">Review waiver</Link>}
        </p>
      )}
    </div>
  );
}
