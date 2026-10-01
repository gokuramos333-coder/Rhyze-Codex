'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Bundle } from './types';
export function CustomerEmailActivity({ userId }: { userId: string }) {
  const [data, setData] = useState<Bundle | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/admin/newsletters?customerId=' + encodeURIComponent(userId))
      .then(async (r) => {
        if (!r.ok) throw Error('Admin-only email activity is unavailable.');
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [userId]);
  return (
    <section className="nl-panel" style={{ marginTop: 20 }}>
      <h2>Newsletter activity</h2>
      <p className="nl-muted">
        Separate from personal calls and texts. Opens do not prove reading.
      </p>
      {error && <p>{error}</p>}
      {data?.campaigns
        .filter((c) => c.recipients.some((r) => r.userId === userId))
        .map((c) => {
          const r = c.recipients.find((r) => r.userId === userId)!;
          return (
            <p key={c.id}>
              <strong>{c.name}</strong> · {r.status}
              <br />
              <small>
                {data.settings.opensSupported
                  ? r.events.filter((e) => e.type === 'email.opened').length
                  : 'Unavailable'}{' '}
                recorded opens ·{' '}
                {data.settings.clicksSupported
                  ? r.events.filter((e) => e.type === 'email.clicked').length
                  : 'Unavailable'}{' '}
                recorded clicks
              </small>
            </p>
          );
        })}
      {data &&
        !data.campaigns.some((c) =>
          c.recipients.some((r) => r.userId === userId),
        ) && <p>No newsletter recipient history recorded.</p>}
      <Link href="/admin/newsletters">Open newsletter history →</Link>
    </section>
  );
}
