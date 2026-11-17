'use client';
import { useState } from 'react';
export type RefundReviewItem = {
  id: string;
  paymentRecordId: string;
  identity: {
    customerName: string | null;
    customerEmail: string | null;
    customerId: string | null;
    bookingId: string | null;
    className: string | null;
    classStart: string | null;
    paymentIntentId: string | null;
    originalAmountCents: number;
    refundedAmountCents: number;
    receiptUrl: string | null;
  };
  serviceEffect?: string;
  blockedReason?: string;
  version: number;
  reason: string;
  amountCents: number;
  state: string;
  operationId?: string;
  kind: 'REFUND' | 'REPLACEMENT';
  createdAt: string;
};
export type ReviewCommand = {
  id: string;
  paymentRecordId: string;
  version: number;
  amountCents: number;
  kind: 'REFUND' | 'REPLACEMENT';
  reason: string;
  authorizationReference?: string;
  operationId?: string;
};
export function RefundReviewQueue({
  items,
  act,
  simulation = false,
}: {
  items: RefundReviewItem[];
  act: (command: ReviewCommand) => Promise<string>;
  simulation?: boolean;
}) {
  const [references, setReferences] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  async function run(item: RefundReviewItem) {
    if (item.blockedReason) return;
    setBusy(item.id);
    try {
      const message = await act({
        ...item,
        reason: reasons[item.id] ?? '',
        ...(item.kind === 'REPLACEMENT'
          ? { authorizationReference: references[item.id] ?? '' }
          : {}),
      });
      setMessages((previous) => ({ ...previous, [item.id]: message }));
    } catch (error) {
      setMessages((previous) => ({
        ...previous,
        [item.id]:
          error instanceof Error
            ? error.message
            : 'Action failed. Reload or reconcile; do not resubmit an uncertain payment.',
      }));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section
      className="review-queue space-y-6"
      aria-label="Financial review queue"
    >
      {simulation && (
        <aside role="status">
          <strong>SIMULATION — synthetic data only.</strong> In-memory actions
          reset on reload. No API, charges, refunds or customer changes.
        </aside>
      )}
      <h1 className="text-3xl font-bold">Financial review</h1>
      <p>
        Attendance corrections stand independently. Fees remain unchanged until
        an approved owner authorizes an exact refund and its receipt is
        verified.
      </p>
      <p>
        Urgent failed-service and possible duplicate obligations remain open
        until reconciled. Unknown outcomes reserve ownership and block further
        collection for that booking.
      </p>
      {!items.length && <p>No financial reviews to display.</p>}
      {items.map((item) => (
        <article
          className="space-y-3 border border-rhyze-black/20 bg-white p-5"
          key={item.id}
        >
          <header>
            <strong>
              {item.kind === 'REFUND'
                ? 'Refund review'
                : 'Replacement no-show fee'}
            </strong>
            <span> · ${(item.amountCents / 100).toFixed(2)} USD</span>
          </header>
          <dl style={{ overflowWrap: 'anywhere' }}>
            <dt>Customer</dt>
            <dd>
              {item.identity.customerName ?? 'Name unavailable'} ·{' '}
              {item.identity.customerEmail ?? 'Email unavailable'}
            </dd>
            <dt>Member ID</dt>
            <dd>{item.identity.customerId ?? 'Not linked'}</dd>
            <dt>Booking ID</dt>
            <dd>{item.identity.bookingId ?? 'No booking linked'}</dd>
            <dt>Class / start (UTC)</dt>
            <dd>
              {item.identity.className ?? 'Not applicable'} ·{' '}
              {item.identity.classStart ?? 'Not applicable'}
            </dd>
            <dt>Payment record</dt>
            <dd>{item.paymentRecordId}</dd>
            <dt>Payment intent</dt>
            <dd>
              {item.identity.paymentIntentId ?? 'Receipt identity unavailable'}
            </dd>
          </dl>
          <p>
            Original ${(item.identity.originalAmountCents / 100).toFixed(2)} ·
            Refunded ${(item.identity.refundedAmountCents / 100).toFixed(2)} ·
            Remaining $
            {(
              (item.identity.originalAmountCents -
                item.identity.refundedAmountCents) /
              100
            ).toFixed(2)}{' '}
            USD
          </p>
          {item.identity.receiptUrl &&
          /^https:\/\//i.test(item.identity.receiptUrl) ? (
            <a
              href={item.identity.receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Original receipt
            </a>
          ) : (
            <p>
              {simulation
                ? 'Synthetic receipt — no external link'
                : 'Receipt link unavailable'}
            </p>
          )}
          <p>{item.reason}</p>
          {item.serviceEffect && <p role="note">{item.serviceEffect}</p>}
          {item.blockedReason && <p role="alert">{item.blockedReason}</p>}
          <p>
            Opened {item.createdAt} · {item.state}
          </p>
          {!item.operationId && (
            <label>
              Case-specific approval reason
              <input
                className="mt-2 block w-full border border-gray-400 p-3"
                value={reasons[item.id] ?? ''}
                onChange={(e) =>
                  setReasons({ ...reasons, [item.id]: e.target.value })
                }
                minLength={8}
                placeholder="Why is this exact amount approved?"
              />
            </label>
          )}
          {item.kind === 'REPLACEMENT' && !item.operationId && (
            <label>
              Original requester and authorization reference
              <input
                className="mt-2 block w-full border border-gray-400 p-3"
                value={references[item.id] ?? ''}
                onChange={(e) =>
                  setReferences({ ...references, [item.id]: e.target.value })
                }
              />
            </label>
          )}
          <button
            className="border border-black bg-black p-3 text-white disabled:opacity-40"
            type="button"
            disabled={
              Boolean(item.blockedReason) || busy !== null ||
              (!item.operationId &&
                ((reasons[item.id]?.trim().length ?? 0) < 8 ||
                  (item.kind === 'REPLACEMENT' &&
                    (references[item.id]?.trim().length ?? 0) < 8)))
            }
            onClick={() => void run(item)}
          >
            {busy === item.id
              ? 'Checking…'
              : item.operationId
                ? 'Reconcile existing receipt'
                : `Approve ${item.kind === 'REFUND' ? 'refund' : 'one replacement'} · $${(item.amountCents / 100).toFixed(2)}`}
          </button>
          <p role="status">{messages[item.id]}</p>
        </article>
      ))}
    </section>
  );
}
