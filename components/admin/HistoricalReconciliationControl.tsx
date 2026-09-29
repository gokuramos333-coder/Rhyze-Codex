'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export function HistoricalReconciliationControl({
  from,
  to,
  configured,
}: {
  from: string;
  to: string;
  configured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [mode, setMode] = useState<boolean | null>(null);
  const validRange = Date.parse(to) - Date.parse(from) <= 366 * 86400000;
  async function reconcile(dryRun: boolean, next?: string) {
    setBusy(true);
    if (!next) setCursor(undefined);
    setMessage(
      dryRun
        ? 'Checking the selected dates against Stripe…'
        : 'Reconciling the selected dates with Stripe…',
    );
    try {
      const response = await fetch('/api/admin/payments/reconcile-history', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          from,
          to,
          dryRun,
          reason: 'Owner requested historical financial reconciliation',
          ...(next ? { startingAfter: next } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok)
        throw new Error(
          result.error ||
            'Reconciliation could not complete. Existing evidence remains visible.',
        );
      setMode(dryRun);
      setCursor(
        result.hasMore && result.nextCursor ? result.nextCursor : undefined,
      );
      setMessage(
        `${dryRun ? 'Preview completed; no records changed.' : 'This batch was reconciled.'} ${result.hasMore ? 'More payments remain. Continue to process the next batch.' : 'All payments created in the selected dates have been checked.'}`,
      );
      if (!dryRun) router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Reconciliation failed. Retry this period.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-5 border border-rhyze-orange/25 bg-white p-5">
      <h2 className="font-display text-3xl">
        VERIFY CHARGES CREATED IN SELECTED DATES
      </h2>
      <p className="mt-2 text-sm text-rhyze-black/60">
        Refresh receipts for payments created in the date range selected above.
        Their later refunds and disputes are included. Refunds in this report
        period on earlier payments require selecting the original charge history
        through the report cutoff. Each batch checks up to 25 payments.
        Unfinished batches do not establish complete coverage.
      </p>
      {!validRange && (
        <p className="mt-2 text-sm">
          Choose a date range of 366 days or less to reconcile.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          disabled={busy || !configured || !validRange}
          onClick={() => reconcile(true)}
          className="border border-rhyze-black px-4 py-2 font-bold disabled:opacity-40"
        >
          Preview selected dates
        </button>
        <button
          disabled={busy || !configured || !validRange}
          onClick={() => reconcile(false)}
          className="bg-rhyze-black px-4 py-2 font-bold text-white disabled:opacity-40"
        >
          Reconcile selected dates
        </button>
        {cursor && mode !== null && (
          <button
            disabled={busy}
            onClick={() => reconcile(mode, cursor)}
            className="border border-rhyze-coral px-4 py-2 font-bold disabled:opacity-40"
          >
            Continue next batch
          </button>
        )}
      </div>
      <p role="status" className="mt-3 text-sm">
        {message}
      </p>
    </section>
  );
}
