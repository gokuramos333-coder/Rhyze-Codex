'use client';

import React from 'react';
import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

export function EventCheckoutButton({
  slug,
  occurrenceId,
  soldOut = false,
  waitlistFull = false,
  familyPricing = false,
}: {
  slug: string;
  occurrenceId?: string;
  soldOut?: boolean;
  waitlistFull?: boolean;
  familyPricing?: boolean;
}) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [childCount, setChildCount] = useState(1);

  async function beginCheckout() {
    if (soldOut && occurrenceId) {
      window.location.assign(`/member/bookings/new?occurrence=${encodeURIComponent(occurrenceId)}`);
      return;
    }
    setLoading(true);
    setError('');
    const response = await fetch('/api/checkout/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slug,
        ...(familyPricing ? { childCount } : {}),
      }),
    });
    const result = await response.json() as { url?: string; error?: string };
    if (response.status === 401) {
      window.location.assign(`/sign-in?callbackUrl=${encodeURIComponent(`/book/event/${slug}`)}`);
      return;
    }
    if (!response.ok || !result.url) {
      setError(result.error || 'Event checkout could not be started.');
      setLoading(false);
      return;
    }
    window.location.assign(result.url);
  }

  return (
    <div className="mt-6">
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
      <button
        type="button"
        onClick={beginCheckout}
        disabled={loading || waitlistFull}
        className="focus-ring flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-rhyze-gradient px-6 text-sm font-black uppercase tracking-widest text-rhyze-black disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-5 w-5" aria-hidden />}
        {waitlistFull ? 'Waitlist Full' : loading ? 'Connecting securely…' : soldOut ? 'Join Waiting List' : 'Confirm Event Booking'}
      </button>
      {error && <p className="mt-3 border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-3 text-sm">{error}</p>}
    </div>
  );
}
