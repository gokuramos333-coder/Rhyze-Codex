'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { SpecialEventReview } from '@/lib/payments/special-event-roster';
import { eventTicketMoney } from './BlackFridayPendingRoster';

type ReviewAction = (formData: FormData) => Promise<boolean>;

const reviewLabels: Record<string, string> = {
  HELD: 'Checkout pending',
  PAID: 'Paid',
  REVIEW: 'Payment needs review',
  REVERSING: 'Refund in progress',
  EXPIRED: 'Checkout expired',
  DISPUTED: 'Payment disputed',
  PARTIALLY_REFUNDED: 'Partially refunded',
  REFUNDED: 'Refunded',
  DISPUTE_LOST: 'Dispute lost',
  FULFILLMENT_REVIEW: 'Payment needs review',
};

function ReviewForm({ item, operation, reviewAction }: {
  item: SpecialEventReview;
  operation: 'RECONCILE' | 'CANCEL';
  reviewAction: ReviewAction;
}) {
  const refund = operation === 'CANCEL';
  const remaining = eventTicketMoney(item.remainingCents);
  const [saved, submit, pending] = useActionState(async (_previous: boolean | null, data: FormData) => {
    try {
      return await reviewAction(data);
    } catch {
      return false;
    }
  }, null);

  return (
    <details className="mt-2 rounded-md border border-rhyze-black/15 px-3 py-2">
      <summary className="cursor-pointer font-semibold">{refund ? 'Refund and cancel ticket' : 'Check payment status'}</summary>
      <form action={submit} className="mt-2 grid gap-3">
        <input type="hidden" name="orderId" value={item.orderId} />
        <input type="hidden" name="operation" value={operation} />
        <label className="grid gap-1">
          Staff reason
          <input name="reason" required minLength={5} className="min-h-10 w-full rounded-md border border-rhyze-black/25 px-3" />
        </label>
        {refund ? (
          <>
            <input type="hidden" name="expectedRefundCents" value={item.remainingCents} />
            <label className="flex items-start gap-2">
              <input name="cancelConfirmed" type="checkbox" required className="mt-0.5 h-4 w-4 shrink-0" />
              I approve canceling this ticket and refunding {remaining}.
            </label>
          </>
        ) : (
          <label className="grid gap-1">
            Recovered Stripe session ID (optional)
            <input name="sessionId" autoComplete="off" className="min-h-10 w-full rounded-md border border-rhyze-black/25 px-3" />
          </label>
        )}
        <button className="focus-ring min-h-10 justify-self-start rounded-md bg-rhyze-black px-3 font-semibold text-white disabled:opacity-50" disabled={pending}>
          {refund ? `Approve ${remaining} refund` : 'Check status'}
        </button>
        {saved !== null && !pending && <p role={saved ? 'status' : 'alert'}>{saved ? 'Payment review saved.' : 'Couldn’t complete this action. Refresh the roster and check the payment before retrying.'}</p>}
      </form>
    </details>
  );
}

export function EventPaymentReview({ items, reviewAction }: { items: SpecialEventReview[]; reviewAction: ReviewAction }) {
  const visibleItems = items.filter((item) => item.state !== 'EXPIRED' || item.collectedCents > 0);
  if (!visibleItems.length) return null;

  return (
    <details className="mt-8 rounded-lg border border-rhyze-black/15 bg-white p-4 text-sm">
      <summary className="cursor-pointer font-semibold">Payments and checkout history</summary>
      <ul className="mt-3 divide-y divide-rhyze-black/10">
        {visibleItems.map((item) => (
          <li key={item.orderId} className="py-3">
            <p className="font-semibold">{item.buyerName}</p>
            <p className="mt-1 text-rhyze-black/70">
              {reviewLabels[item.state] ?? 'Payment needs review'} · {item.collectedCents > 0 ? `${eventTicketMoney(item.collectedCents)} collected` : 'No payment collected'}
            </p>
            {item.management === 'LEGACY_ORDER' ? (
              <Link href="/admin/payments" className="mt-2 inline-block font-semibold underline">Open payments</Link>
            ) : (
              <>
                {item.canReconcile && <ReviewForm item={item} reviewAction={reviewAction} operation="RECONCILE" />}
                {item.canRefund && item.collectedCents > 0 && item.remainingCents > 0 && <ReviewForm item={item} reviewAction={reviewAction} operation="CANCEL" />}
              </>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
