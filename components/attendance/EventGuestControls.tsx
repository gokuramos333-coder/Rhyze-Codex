'use client';

import { useId, useState, useTransition } from 'react';
import type { GuestAccountMatch } from '@/lib/payments/special-event-guests';

export type GuestActions = {
  recordPaperWaiverAction: (input: {
    orderId: string;
    displayedWaiverVersionId: string;
    paperCollected: boolean;
  }) => Promise<boolean>;
  checkInAction: (input: { orderId: string }) => Promise<boolean>;
  searchAccountsAction: (input: { orderId: string; query: string }) => Promise<GuestAccountMatch[] | null>;
  linkAccountAction: (input: {
    orderId: string;
    selectedUserId: string;
    identityConfirmed: boolean;
  }) => Promise<boolean>;
};

const actionButton = 'focus-ring min-h-10 rounded-md border border-rhyze-black/25 px-3 text-sm font-semibold hover:bg-rhyze-black/5 disabled:opacity-50';
const secondaryControl = 'mt-2 rounded-md border border-rhyze-black/15 px-3 py-2 text-sm';
const inputClass = 'mt-1 block min-h-10 w-full rounded-md border border-rhyze-black/25 px-3';

export function EventGuestControls({
  orderId, waiverVersionId, showCheckIn, showLink, actions,
}: {
  orderId: string;
  waiverVersionId: string | null;
  showCheckIn: boolean;
  showLink: boolean;
  actions: GuestActions;
}) {
  const resultId = useId();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const [paperCollected, setPaperCollected] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<GuestAccountMatch[]>([]);
  const [selected, setSelected] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  function submit(action: () => Promise<boolean>, success: string, failure: string) {
    setFeedback(null);
    startTransition(async () => {
      let saved = false;
      try {
        saved = await action();
      } catch {
        // The action can also fail to reach the server.
      }
      setFeedback({ text: saved ? success : failure, error: !saved });
    });
  }

  function search() {
    setMatches([]);
    setSelected('');
    setConfirmed(false);
    submit(async () => {
      const results = await actions.searchAccountsAction({ orderId, query: query.trim() });
      if (!results) return false;
      setMatches(results);
      return true;
    }, 'Account search complete.', 'Couldn’t search for accounts. Try again.');
  }

  if (!waiverVersionId && !showCheckIn && !showLink) return null;

  return (
    <div className="grid min-w-0 justify-items-start">
      {showCheckIn && (
        <button type="button" className="focus-ring min-h-10 rounded-md bg-rhyze-black px-4 text-sm font-bold text-white disabled:opacity-50" disabled={pending}
          onClick={() => submit(() => actions.checkInAction({ orderId }), 'Guest checked in.', 'Couldn’t check in the guest. Refresh the roster and confirm the waiver.')}>
          Check in
        </button>
      )}
      {waiverVersionId && (
        <details className={secondaryControl}>
          <summary className="cursor-pointer font-semibold">Record paper waiver</summary>
          <form className="mt-3 grid gap-3" onSubmit={(event) => {
            event.preventDefault();
            if (paperCollected) submit(
              () => actions.recordPaperWaiverAction({ orderId, displayedWaiverVersionId: waiverVersionId, paperCollected }),
              'Signed paper waiver recorded.', 'Couldn’t save the waiver record. Refresh the roster and check the current waiver.',
            );
          }}>
            <label className="flex items-start gap-2">
              <input type="checkbox" required checked={paperCollected} onChange={(event) => setPaperCollected(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-rhyze-coral" />
              I collected the guest’s signed current paper waiver
            </label>
            <button className={actionButton} disabled={!paperCollected || pending}>Save waiver record</button>
          </form>
        </details>
      )}
      {showLink && (
        <details className={secondaryControl}>
          <summary className="cursor-pointer font-semibold">Link guest account</summary>
          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => {
            event.preventDefault();
            if (query.trim().length >= 2) search();
          }}>
            <label className="min-w-0 flex-1 font-semibold">
              Guest name or phone
              <input required minLength={2} maxLength={120} value={query} autoComplete="off" className={inputClass}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setMatches([]);
                  setSelected('');
                  setConfirmed(false);
                  setFeedback(null);
                }} disabled={pending} />
            </label>
            <button className={actionButton} disabled={query.trim().length < 2 || pending}>Search</button>
          </form>
          {matches.length > 0 && (
            <form className="mt-3 grid gap-3" onSubmit={(event) => {
              event.preventDefault();
              if (selected && confirmed) submit(
                () => actions.linkAccountAction({ orderId, selectedUserId: selected, identityConfirmed: confirmed }),
                'Guest account linked.', 'Couldn’t link this account. Check the guest’s name and phone, then refresh the roster.',
              );
            }}>
              <fieldset className="grid gap-2" disabled={pending}>
                <legend className="mb-1 font-semibold">Matching accounts</legend>
                {matches.map((match) => (
                  <label key={match.id} className="flex items-start gap-2 break-words">
                    <input type="radio" name={resultId} value={match.id} checked={selected === match.id} onChange={() => { setSelected(match.id); setConfirmed(false); }} className="mt-1 accent-rhyze-coral" />
                    <span>{match.name} · {match.phone}</span>
                  </label>
                ))}
              </fieldset>
              <label className="flex items-start gap-2">
                <input type="checkbox" required disabled={!selected || pending} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-rhyze-coral" />
                I verified this account belongs to the guest
              </label>
              <button className={actionButton} disabled={!selected || !confirmed || pending}>Link selected account</button>
            </form>
          )}
        </details>
      )}
      {pending && <p role="status" className="mt-2 text-sm">Working…</p>}
      {feedback && !pending && (
        <p role={feedback.error ? 'alert' : 'status'} className={`mt-2 text-sm ${feedback.error ? 'text-red-800' : 'text-rhyze-black/70'}`}>
          {feedback.text === 'Account search complete.' && matches.length === 0 ? 'No matching accounts found.' : feedback.text}
        </p>
      )}
    </div>
  );
}
