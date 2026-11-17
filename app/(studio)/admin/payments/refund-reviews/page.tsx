import Link from 'next/link';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { type FinancialOperation } from '@/lib/payments/refund-review';
import {
  RefundReviewQueue,
  type RefundReviewItem,
} from '@/components/admin/refund-review-queue';
import {
  financialReviewAction,
  openCollectionReviewAction,
  adjudicateReviewAction,
  investigateCollectionAction,
  openPaymentReviewAction,
} from './actions';
import {
  financialQueuePage,
  financialQueueBacklog,
} from '@/lib/payments/refund-review-queue';
import { financialReviewOwners } from '@/lib/payments/refund-review-tasks';
export default async function FinancialReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{
    reviews?: string;
    collections?: string;
    replacements?: string;
  }>;
}) {
  await requireApprovedOwner();
  const params = await searchParams;
  const [reviewPage, collectionPage, replacementPage, backlog] =
    await Promise.all([
      financialQueuePage(prisma, 'reviews', { cursor: params.reviews }),
      financialQueuePage(prisma, 'collections', { cursor: params.collections }),
      financialQueuePage(prisma, 'replacements', {
        cursor: params.replacements,
      }),
      financialQueueBacklog(prisma),
    ]);
  const reviews = reviewPage.rows,
    uncertain = collectionPage.rows;
  const paymentIds = [
    ...reviews.map((r) => r.paymentRecordId),
    ...replacementPage.rows.map((r) => r.id),
  ];
  const operations = await prisma.$queryRaw<
    FinancialOperation[]
  >`SELECT * FROM "ApprovedFinancialOperation" WHERE "paymentRecordId" = ANY(${paymentIds}::text[])`;
  let monitoring =
    'BLOCKED: verified Vanessa and Melissa identities are not configured.';
  try {
    const config = financialReviewOwners();
    monitoring = `Joint owners configured; identity evidence: ${config.evidenceReference}. Escalation after 24 hours to both.`;
  } catch {
    /* Visible release blocker; never guess recipient identities. */
  }
  const pageLink = (
    section: 'reviews' | 'collections' | 'replacements',
    cursor: string,
  ) => {
    const query = new URLSearchParams();
    for (const key of ['reviews', 'collections', 'replacements'] as const)
      if (params[key]) query.set(key, params[key]!);
    query.set(section, cursor);
    return `/admin/payments/refund-reviews?${query}`;
  };
  const paymentInclude = {
    user: true,
    purchase: true,
    booking: { include: { occurrence: { include: { template: true } } } },
  } as const;
  const reviewPayments = await prisma.paymentRecord.findMany({
    where: {
      OR: [
        { id: { in: reviews.map((r) => r.paymentRecordId) } },
        {
          stripePaymentIntentId: {
            in: uncertain.flatMap((c) =>
              c.paymentIntentId ? [c.paymentIntentId] : [],
            ),
          },
        },
      ],
    },
    include: paymentInclude,
  });
  const candidates = await prisma.paymentRecord.findMany({
    where: { id: { in: replacementPage.rows.map((r) => r.id) } },
    include: paymentInclude,
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
  });
  const payments = [
    ...new Map(
      [...reviewPayments, ...candidates].map((p) => [p.id, p]),
    ).values(),
  ];
  const identity = (
    payment: (typeof payments)[number],
  ): RefundReviewItem['identity'] => ({
    customerName: payment.user?.name ?? payment.customerName,
    customerEmail: payment.user?.email ?? payment.customerEmail,
    customerId: payment.userId,
    bookingId: payment.bookingId,
    className: payment.booking?.occurrence.template.name ?? payment.productName,
    classStart: payment.booking?.occurrence.startAt.toISOString() ?? null,
    paymentIntentId: payment.stripePaymentIntentId,
    originalAmountCents: payment.amountCents,
    refundedAmountCents: payment.refundedAmountCents,
    receiptUrl: payment.receiptUrl,
  });
  const items: RefundReviewItem[] = reviews
    .filter((r) => !r.resolvedAt)
    .flatMap((review) => {
      const payment = payments.find((p) => p.id === review.paymentRecordId);
      if (!payment) return [];
      const operation = operations.find(
        (o) => o.paymentRecordId === payment.id && o.kind === 'REFUND',
      );
      const unsupportedOriginal = Boolean(payment.stripeSubscriptionId && payment.purchase?.stripePaymentIntentId === payment.stripePaymentIntentId);
      return [
        {
          blockedReason: !operation && unsupportedOriginal ? 'Original subscription payment: service disposition needs review before a refund. No money has been submitted.' : !operation && !payment.stripePaymentIntentId ? 'Provider payment identity is missing. Investigate before approval; do not retry collection.' : undefined,
          id: review.id,
          paymentRecordId: payment.id,
          identity: identity(payment),
          version: review.version,
          serviceEffect: payment.stripeSubscriptionId
            ? 'Renewal invoice refund only. Current service and recurring billing continue. Original subscription purchases require a separate service disposition.'
            : undefined,
          reason: review.reason,
          amountCents:
            operation?.amountCents ??
            payment.amountCents - payment.refundedAmountCents,
          state: operation?.state ?? 'URGENT · OWNER REVIEW',
          operationId: operation?.id,
          kind: 'REFUND',
          createdAt: review.createdAt.toISOString(),
        },
      ];
    });
  for (const payment of candidates.filter(
    (p) =>
      p.kind === 'NO_SHOW_FEE' &&
      p.status === 'REFUNDED' &&
      p.amountCents === 1000,
  )) {
    const operation = operations.find(
      (o) => o.paymentRecordId === payment.id && o.kind === 'REPLACEMENT',
    );
    if (
      operation?.state === 'SUCCEEDED' ||
      operations.some(
        (o) =>
          o.kind === 'REPLACEMENT' &&
          o.providerId === payment.stripePaymentIntentId,
      )
    )
      continue;
    items.push({
      id: payment.id,
      paymentRecordId: payment.id,
      identity: identity(payment),
      version: 1,
      reason:
        'Replacement requires a complete current attempt scan, exact original card and consent proof. Attendance will not change.',
      amountCents: 1000,
      state: operation?.state ?? 'ELIGIBILITY CHECK REQUIRED',
      operationId: operation?.id,
      kind: 'REPLACEMENT',
      createdAt: payment.occurredAt.toISOString(),
    });
  }
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <Link href="/admin/payments">← Payments</Link>
      <aside role="status" className="border p-4">
        <p>{monitoring}</p>
        <p>
          {String(backlog.open)} open reviews · {String(backlog.overdue)}{' '}
          overdue · {String(backlog.uncertain)} uncertain/service cases ·{' '}
          {String(backlog.unassigned)} unassigned reviews.
        </p>
        <p>
          Cash under review (each payment counted once):{' '}
          {backlog.amounts
            .map(
              (a) =>
                `${a.currency.toUpperCase()} ${(Number(a.cents) / 100).toFixed(2)}`,
            )
            .join(' · ') || '0'}
          . Unknown collections without receipts are additional unpriced
          exposure.
        </p>
      </aside>
      <form action={openPaymentReviewAction} className="space-y-2 border p-4">
        <h2>Open exact payment review</h2>
        <p>
          Use the payment record ID, including a recurring renewal invoice.
          Opening a case does not issue a refund.
        </p>
        <label>
          Payment record ID{' '}
          <input name="paymentRecordId" required className="border" />
        </label>
        <label>
          Reason{' '}
          <input name="reason" required minLength={8} className="border" />
        </label>
        <button type="submit" className="border p-2">
          Open review
        </button>
      </form>
      {uncertain.length > 0 && (
        <aside role="status" className="border border-red-700 p-4">
          <strong>
            Urgent: {uncertain.length} collection or service outcomes need
            investigation.
          </strong>
          <p>
            No retry is permitted. Verify provider history and service ownership
            before approving a corrective refund.
          </p>
          <ul>
            {uncertain.map((row) => (
              <li key={row.bookingId}>
                Booking {row.bookingId} · {row.createdAt.toISOString()}
                <p style={{ overflowWrap: 'anywhere' }}>
                  Payment intent: {row.paymentIntentId ?? 'Unknown'} ·{' '}
                  {payments.find(
                    (p) => p.stripePaymentIntentId === row.paymentIntentId,
                  )?.user?.email ?? 'Customer requires investigation'}
                </p>
                <form action={investigateCollectionAction}>
                  <input
                    type="hidden"
                    name="bookingId"
                    value={row.bookingId ?? ''}
                  />
                  <label>
                    Investigation evidence{' '}
                    <input
                      name="evidence"
                      required
                      minLength={16}
                      className="border"
                    />
                  </label>
                  <button type="submit" className="border p-2">
                    Record investigation; retain ownership
                  </button>
                </form>
                {row.paymentIntentId && (
                  <form action={openCollectionReviewAction}>
                    <input
                      type="hidden"
                      name="bookingId"
                      value={row.bookingId ?? ''}
                    />
                    <button className="border p-2" type="submit">
                      Open exact payment review
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </aside>
      )}
      <RefundReviewQueue items={items} act={financialReviewAction} />
      {reviews.map((review) => (
        <details key={review.id} className="border p-4">
          <summary>
            Adjudicate case {review.id} · version {review.version}
          </summary>
          <p>
            Record provider/service evidence. Refreshing an unapproved stale
            case requires fresh per-case approval afterward. Existing UNKNOWN,
            pending or failed operation owners never expire or retry.
          </p>
          <form action={adjudicateReviewAction} className="space-y-2">
            <input type="hidden" name="reviewId" value={review.id} />
            <input type="hidden" name="version" value={review.version} />
            <label>
              Decision{' '}
              <select name="decision" className="border">
                <option value="INVESTIGATE">Record investigation only</option>
                <option value="REFRESH_BASIS">
                  Refresh stale unapproved basis
                </option>
              </select>
            </label>
            {!review.basis && (
              <label>
                Legacy service disposition{' '}
                <select name="basisKind" required className="border">
                  <option value="">Select the verified basis</option>
                  <option value="PAYMENT_REFUND">
                    Owner-requested payment refund
                  </option>
                  <option value="ATTENDANCE_CORRECTION">
                    Attendance correction
                  </option>
                  <option value="FAILED_SERVICE">
                    Verified failed service
                  </option>
                </select>
              </label>
            )}
            <label>
              Evidence/reference{' '}
              <textarea
                name="evidence"
                required
                minLength={16}
                className="border"
              />
            </label>
            <button type="submit" className="border p-2">
              Save adjudication
            </button>
          </form>
        </details>
      ))}
      <nav aria-label="Financial queue pages" className="flex gap-4">
        <Link href="/admin/payments/refund-reviews">First pages</Link>
        {reviewPage.next && (
          <Link href={pageLink('reviews', reviewPage.next)}>Next reviews</Link>
        )}
        {collectionPage.next && (
          <Link href={pageLink('collections', collectionPage.next)}>
            Next uncertain cases
          </Link>
        )}
        {replacementPage.next && (
          <Link href={pageLink('replacements', replacementPage.next)}>
            Next replacement candidates
          </Link>
        )}
      </nav>
    </main>
  );
}
