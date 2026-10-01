'use client';
import { contactStatusColors } from './status-colors';
import { useState } from 'react';
import Link from 'next/link';
import { label, outcomes } from '@/lib/newsletters/domain';
export function ContactStatusControl({
  userId,
  version: initialVersion,
  outcome: initialOutcome,
  lastStaff,
  lastContacted,
}: {
  userId: string;
  version: number;
  outcome: string;
  lastStaff?: string;
  lastContacted?: string;
}) {
  const [version, setVersion] = useState(initialVersion),
    [outcome, setOutcome] = useState(initialOutcome),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  return (
    <div style={{ minWidth: 190, padding: 8 }}>
      {lastStaff && (
        <small>
          {lastStaff} ·{' '}
          {lastContacted ? new Date(lastContacted).toLocaleDateString() : ''}
        </small>
      )}
      <select
        aria-label="Contact status or log completed outreach"
        disabled={busy}
        value={outcome}
        style={contactStatusColors(outcome)}
        onChange={async (e) => {
          const value = e.target.value;
          setBusy(true);
          try {
            const outreach = value === 'LOG_TEXT' || value === 'LOG_CALL';
            const r = await fetch('/api/admin/leads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                version,
                operationKey: crypto.randomUUID(),
                type: outreach ? 'OUTREACH' : 'STATUS',
                ...(outreach
                  ? { method: value === 'LOG_TEXT' ? 'TEXT' : 'CALL' }
                  : { outcome: value }),
              }),
            });
            const x = await r.json();
            if (!r.ok) throw Error(x.error);
            setVersion((v) => v + 1);
            if (!outreach) setOutcome(value);
            setMessage(
              outreach ? 'Outreach logged. No message sent.' : 'Status saved.',
            );
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        className="min-h-11 w-full border border-black/20 bg-white p-2 text-xs"
      >
        <optgroup label="Contact outcome">
          {outcomes.map((o) => (
            <option key={o} value={o}>
              {label(o)}
            </option>
          ))}
        </optgroup>
        <optgroup label="Log a completed action">
          <option value="LOG_TEXT">Log completed text</option>
          <option value="LOG_CALL">Log completed call</option>
        </optgroup>
      </select>
      <small role="status">{message}</small>
      <Link
        href={'/admin/members/' + userId + '#outreach'}
        className="text-xs underline"
      >
        Shared timeline / notes
      </Link>
    </div>
  );
}
