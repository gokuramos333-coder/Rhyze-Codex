import { assertFinancialRelease, assertFinancialSubmission } from '@/lib/payments/financial-release';
import { assertFinancialApprover } from '@/lib/auth/financial-owner-access';
import { queueApprovedRefundConfirmation } from './refund-review-notification';
import { lockMembershipEntitlements } from '@/lib/domain/credits/entitlement-lock';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  verifyReceipt,
  refundSettlementMatches,
  type BoundReceipt,
} from './refund-review-policy';
export type FinancialTx = Prisma.TransactionClient;
export type FinancialKind = 'REFUND' | 'REPLACEMENT';
export type FinancialPayload = {
  servicePolicy?: 'PRESERVE_RECURRING_SERVICE';
  subscriptionId?: string;
  invoiceId?: string;
  paymentIntentId: string;
  chargeId: string;
  customerId: string;
  cardId: string;
  accountId: string;
  livemode: boolean;
  bookingId: string | null;
  userId: string | null;
  amountCents: number;
  currency: string;
  originalAmountCents: number;
  refundedBeforeCents: number;
  evidence: string;
};
export type FinancialOperation = {
  id: string;
  paymentRecordId: string;
  reviewId: string | null;
  kind: FinancialKind;
  actorId: string;
  amountCents: number;
  currency: string;
  payload: FinancialPayload;
  providerKey: string;
  state: string;
  providerId: string | null;
};
export type ReviewRow = {
  id: string;
  paymentRecordId: string;
  bookingId: string | null;
  reason: string;
  requesterId?: string | null;
  version: number;
  urgent: boolean;
  createdAt: Date;
  resolvedAt: Date | null;
  basis: {
    kind: 'PAYMENT_REFUND' | 'ATTENDANCE_CORRECTION' | 'FAILED_SERVICE';
    snapshot: string;
  } | null;
};
export interface FinancialProvider {
  inspect(
    tx: FinancialTx,
    paymentRecordId: string,
    kind: FinancialKind,
  ): Promise<FinancialPayload>;
  submit(operation: FinancialOperation, beforeSubmission:()=>Promise<void>): Promise<string>;
  // Must retrieve/list from the provider independently, never trust create response.
  receipt(operation: FinancialOperation): Promise<BoundReceipt | null>;
}
export async function financialLock(
  tx: FinancialTx,
  bookingId: string | null,
  paymentIntentId: string,
) {
  if (bookingId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bookingId}))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`financial:${paymentIntentId}`}))`;
}
/** Common ordering for approval, reconciliation and provider accounting.
 * Invoice/checkout writers use entitlement -> Purchase -> PaymentRecord and
 * never acquire financial ownership afterward. Attendance has no purchase lock.
 */
export async function financialLedgerLock(
  tx: FinancialTx,
  paymentRecordId: string,
) {
  const initial = await tx.paymentRecord.findUnique({
    where: { id: paymentRecordId },
  });
  if (!initial?.stripePaymentIntentId)
    throw Error('Exact financial receipt required');
  await financialLock(tx, initial.bookingId, initial.stripePaymentIntentId);
  if (initial.userId && (initial.purchaseId || initial.membershipId))
    await lockMembershipEntitlements(tx, initial.userId);
  if (initial.purchaseId)
    await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id=${initial.purchaseId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM "PaymentRecord" WHERE id=${initial.id} FOR UPDATE`;
  const fresh = await tx.paymentRecord.findUnique({
    where: { id: initial.id },
  });
  if (
    !fresh ||
    fresh.stripePaymentIntentId !== initial.stripePaymentIntentId ||
    fresh.bookingId !== initial.bookingId ||
    fresh.purchaseId !== initial.purchaseId ||
    fresh.membershipId !== initial.membershipId ||
    fresh.userId !== initial.userId
  )
    throw Error('Financial receipt ownership changed; investigate');
  return fresh;
}
/** Captured after the correction commits its writes, under booking ownership. */
export async function refundReviewSnapshot(
  tx: FinancialTx,
  payment: {
    bookingId: string | null;
    stripePaymentIntentId: string | null;
  },
) {
  if (!payment.bookingId) return JSON.stringify({ booking: null });
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: payment.bookingId },
    include: { attendance: true },
  });
  const collections = await tx.$queryRaw<
    {
      state: string;
      paymentIntentId: string | null;
      serviceConfirmed: boolean;
    }[]
  >`
    SELECT state,"paymentIntentId","serviceConfirmed" FROM "AttendanceCollection" WHERE "bookingId"=${payment.bookingId}`;
  return JSON.stringify({
    booking: {
      id: booking.id,
      userId: booking.userId,
      occurrenceId: booking.occurrenceId,
      status: booking.status,
      version: booking.updatedAt.toISOString(),
      policy: booking.policySnapshot,
    },
    attendance: booking.attendance
      ? {
          id: booking.attendance.id,
          status: booking.attendance.status,
          version: booking.attendance.updatedAt.toISOString(),
        }
      : null,
    collection: collections[0]
      ? {
          state: collections[0].state,
          paymentIntentId: collections[0].paymentIntentId,
          serviceConfirmed: collections[0].serviceConfirmed,
        }
      : null,
  });
}
async function validateReviewBasis(
  tx: FinancialTx,
  review: ReviewRow,
  payment: {
    bookingId: string | null;
    stripePaymentIntentId: string | null;
  },
) {
  if (
    !review.basis ||
    review.basis.snapshot !== (await refundReviewSnapshot(tx, payment))
  )
    throw Error(
      'Review basis changed or missing; stale review requires new adjudication',
    );
  if (review.basis.kind === 'FAILED_SERVICE') {
    const snapshot = JSON.parse(review.basis.snapshot);
    if (
      !snapshot.collection ||
      snapshot.collection.state !== 'SUCCEEDED' ||
      snapshot.collection.paymentIntentId !== payment.stripePaymentIntentId ||
      snapshot.collection.serviceConfirmed
    )
      throw Error(
        'Successful or unknown service ownership requires adjudication',
      );
    const completed = await tx.bookingTransfer.count({
      where: {
        bookingId: payment.bookingId!,
        stripePaymentIntentId: payment.stripePaymentIntentId,
        status: 'COMPLETED',
      },
    });
    if (completed)
      throw Error(
        'Successful service owns this fee; failed-service refund blocked',
      );
  }
}
export async function requestFinancialReview(
  tx: FinancialTx,
  input: {
    paymentIntentId: string;
    reason: string;
    requesterId?: string;
    basisKind?: NonNullable<ReviewRow['basis']>['kind'];
  },
) {
  const payment = await tx.paymentRecord.findUnique({
    where: { stripePaymentIntentId: input.paymentIntentId },
  });
  if (!payment)
    throw Error(
      'Payment receipt missing: financial review cannot be discarded',
    );
  await financialLock(tx, payment.bookingId, input.paymentIntentId);
  const basis = {
    kind: input.basisKind ?? 'PAYMENT_REFUND',
    snapshot: await refundReviewSnapshot(tx, payment),
  };
  await tx.$executeRaw`INSERT INTO "FinancialReview" (id,"paymentRecordId","bookingId",reason,"requesterId",basis)
    VALUES (${randomUUID()},${payment.id},${payment.bookingId},${input.reason},${input.requesterId ?? null},${JSON.stringify(basis)}::jsonb)
    ON CONFLICT ("paymentRecordId",reason) DO NOTHING`;
}
async function approvedActor(tx: FinancialTx, actorId: string) {
  await assertFinancialApprover(tx, actorId);
}
export async function approveFinancialOperation(
  db: PrismaClient,
  provider: FinancialProvider,
  input: {
    actorId: string;
    paymentRecordId: string;
    kind: FinancialKind;
    reason: string;
    reviewId?: string;
    reviewVersion?: number;
    expectedAmountCents: number;
    authorizationReference?: string;
  },
): Promise<FinancialOperation> {
  if (
    input.kind === 'REPLACEMENT' &&
    (input.authorizationReference?.trim().length ?? 0) < 8
  )
    throw Error('Original requester and authorization reference required');
  if (input.reason.trim().length < 8)
    throw Error('A specific approval reason is required');
  await assertFinancialRelease(db);
  const reserved = await db.$transaction(
    async (tx) => {
      await assertFinancialRelease(tx);
      await approvedActor(tx, input.actorId);
      const payment = await financialLedgerLock(tx, input.paymentRecordId);
      if (!payment.stripePaymentIntentId)
        throw Error('Original provider payment required');
      await financialLock(tx, payment.bookingId, payment.stripePaymentIntentId);
      const previous = await tx.$queryRaw<
        FinancialOperation[]
      >`SELECT * FROM "ApprovedFinancialOperation"
      WHERE "paymentRecordId"=${payment.id} AND kind=${input.kind}`;
      if (previous[0]) return { operation: previous[0], created: false };
      let review: ReviewRow | undefined;
      if (input.reviewId) {
        [review] = await tx.$queryRaw<
          ReviewRow[]
        >`SELECT * FROM "FinancialReview" WHERE id=${input.reviewId} FOR UPDATE`;
        if (
          !review ||
          review.paymentRecordId !== payment.id ||
          review.version !== input.reviewVersion ||
          review.resolvedAt
        )
          throw Error('Review changed; reload before approval');
      }
      if (input.kind === 'REFUND' && !review)
        throw Error('Exact review approval required');
      if (input.kind === 'REFUND' && review)
        await validateReviewBasis(tx, review, payment);
      if (input.kind === 'REPLACEMENT') {
        const parent = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM "ApprovedFinancialOperation" WHERE kind='REPLACEMENT' AND "providerId"=${payment.stripePaymentIntentId}`;
        if (
          parent.length ||
          payment.stripeEventId.startsWith('approved-replacement:')
        )
          throw Error('A replacement cannot itself be replaced');
        const open = await tx.$queryRaw<
          ReviewRow[]
        >`SELECT * FROM "FinancialReview" WHERE "bookingId"=${payment.bookingId} AND "resolvedAt" IS NULL`;
        if (open.length)
          throw Error('Outstanding review blocks additional collection');
        const collection = await tx.$queryRaw<
          { state: string; serviceConfirmed: boolean }[]
        >`SELECT state,"serviceConfirmed" FROM "AttendanceCollection" WHERE "bookingId"=${payment.bookingId}`;
        if (
          collection.some((c) => c.state !== 'SUCCEEDED' || !c.serviceConfirmed)
        )
          throw Error('Uncertain legacy collection blocks replacement');
      }
      const payload = await provider.inspect(tx, payment.id, input.kind);
      if (
        payload.amountCents !== input.expectedAmountCents ||
        payload.currency !== 'usd'
      )
        throw Error('Amount changed; fresh approval required');
      const id = randomUUID();
      const key = `approved-financial:${id}`;
      const hash = createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex');
      const rows = await tx.$queryRaw<
        FinancialOperation[]
      >`INSERT INTO "ApprovedFinancialOperation"
      (id,"paymentRecordId","reviewId",kind,"actorId",reason,"authorizationReference","amountCents",currency,payload,"payloadHash","providerKey",state)
      VALUES (${id},${payment.id},${review?.id ?? null},${input.kind},${input.actorId},${input.reason.trim()},${input.authorizationReference?.trim() ?? `Review ${review?.id}; requester ${review?.requesterId ?? 'system'}`},
      ${payload.amountCents},${payload.currency},${JSON.stringify(payload)}::jsonb,${hash},${key},'UNKNOWN') RETURNING *`;
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: 'financial.approved',
          entityType: 'ApprovedFinancialOperation',
          entityId: id,
          before: {
            paymentStatus: payment.status,
            refundedAmountCents: payment.refundedAmountCents,
          },
          after: {
            payloadHash: hash,
            reviewId: review?.id ?? null,
            reason: input.reason,
          },
        },
      });
      return { operation: rows[0], created: true };
    },
    { timeout: 60000 },
  );
  // The committed UNKNOWN reservation is permanent. A commit-ack loss never reaches here.
  // Neither double clicks nor expiry can submit again, including after process loss.
  if (reserved.created) {
    try {
      await db.$transaction(
        async (tx) => {
          const deadline=Date.now()+60000;
          await assertFinancialRelease(tx);
          await approvedActor(tx, input.actorId);
          await financialLock(
            tx,
            reserved.operation.payload.bookingId,
            reserved.operation.payload.paymentIntentId,
          );
          await financialLedgerLock(tx, reserved.operation.paymentRecordId);
          if (reserved.operation.kind === 'REFUND') {
            const [review] = await tx.$queryRaw<
              ReviewRow[]
            >`SELECT * FROM "FinancialReview" WHERE id=${reserved.operation.reviewId} FOR UPDATE`;
            if (
              !review ||
              review.resolvedAt ||
              review.version !== input.reviewVersion
            )
              throw Error('Review changed after approval');
            await validateReviewBasis(tx, review, {
              bookingId: reserved.operation.payload.bookingId,
              stripePaymentIntentId: reserved.operation.payload.paymentIntentId,
            });
          }
          const fresh = await provider.inspect(
            tx,
            reserved.operation.paymentRecordId,
            reserved.operation.kind,
          );
          if (!isDeepStrictEqual(fresh, reserved.operation.payload))
            throw Error('Financial proof changed after approval');
          await assertFinancialSubmission(tx,deadline);
          const providerId = await provider.submit(reserved.operation,()=>assertFinancialSubmission(tx,deadline));
          await tx.$executeRaw`UPDATE "ApprovedFinancialOperation" SET "providerId"=${providerId} WHERE id=${reserved.operation.id}`;
        },
        { timeout: 60000 },
      );
    } catch {
      return { ...reserved.operation, state: 'UNKNOWN' };
    }
  }
  return reconcileFinancialOperation(db, provider, reserved.operation.id);
}
export async function reconcileFinancialOperation(
  db: PrismaClient,
  provider: FinancialProvider,
  id: string,
): Promise<FinancialOperation> {
  const [operation] = await db.$queryRaw<
    FinancialOperation[]
  >`SELECT * FROM "ApprovedFinancialOperation" WHERE id=${id}`;
  if (!operation) throw Error('Operation missing');
  if (operation.state === 'SUCCEEDED') return operation;
  const receipt = await provider.receipt(operation);
  if (!receipt) return operation;
  const expected = { ...operation.payload, id: operation.id };
  // Replacement receipt's payment intent/charge are newly created but independently
  // bound by metadata, customer, card and account in the provider adapter.
  const binding =
    operation.kind === 'REPLACEMENT'
      ? {
          ...expected,
          paymentIntentId: receipt.paymentIntentId,
          chargeId: receipt.chargeId,
        }
      : expected;
  if (!verifyReceipt(binding, { ...receipt, status: 'succeeded' }))
    throw Error('Provider receipt binding mismatch');
  return db.$transaction(async (tx) => {
    await financialLock(
      tx,
      operation.payload.bookingId,
      operation.payload.paymentIntentId,
    );
    const [current] = await tx.$queryRaw<
      FinancialOperation[]
    >`SELECT * FROM "ApprovedFinancialOperation" WHERE id=${id} FOR UPDATE`;
    if (current.state === 'SUCCEEDED') return current;
    const state =
      receipt.status === 'succeeded'
        ? 'SUCCEEDED'
        : receipt.status === 'failed' || receipt.status === 'canceled'
          ? 'FAILED'
          : 'PENDING';
    if (state === 'SUCCEEDED') {
      const original = await financialLedgerLock(tx, operation.paymentRecordId);
      if (operation.kind === 'REFUND') {
        if (!refundSettlementMatches(operation.payload, original))
          throw Error(
            'Refund accounting binding changed; retain obligation for reconciliation',
          );
        if (original.purchaseId)
          await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id=${original.purchaseId} FOR UPDATE`;
        await tx.paymentRecord.update({
          where: { id: original.id },
          data: {
            status: original.status === 'DISPUTED' ? 'DISPUTED' : 'REFUNDED',
            refundedAmountCents: original.amountCents,
          },
        });
        if (
          original.purchaseId &&
          operation.payload.servicePolicy !== 'PRESERVE_RECURRING_SERVICE'
        ) {
          const purchase = await tx.purchase.findUniqueOrThrow({
            where: { id: original.purchaseId },
          });
          if (
            purchase.stripePaymentIntentId !==
              operation.payload.paymentIntentId ||
            purchase.amountCents !== original.amountCents ||
            purchase.currency !== original.currency
          )
            throw Error(
              'Original purchase changed; retain refund obligation for reconciliation',
            );
          await tx.refund.upsert({
            where: { stripeRefundId: receipt.id },
            create: {
              purchaseId: purchase.id,
              amountCents: operation.amountCents,
              stripeRefundId: receipt.id,
              reason: 'Approved financial review',
            },
            update: {},
          });
          await tx.purchase.update({
            where: { id: purchase.id },
            data: {
              status: 'REFUNDED',
              refundedAmountCents: purchase.amountCents,
            },
          });
          await tx.membership.updateMany({
            where: { purchaseId: purchase.id },
            data: {
              status: 'CANCELLED',
              cancelAtPeriodEnd: false,
              currentPeriodEnd: new Date(),
            },
          });
          await tx.creditAccount.updateMany({
            where: { sourcePurchaseId: purchase.id },
            data: { validUntil: new Date() },
          });
          await tx.referralCommission.updateMany({
            where: { purchaseId: purchase.id },
            data: { status: 'REVERSED', reversedAt: new Date() },
          });
        }
        await queueApprovedRefundConfirmation(tx, original, operation, state);
        await tx.$executeRaw`UPDATE "FinancialReview" SET "resolvedAt"=now() WHERE "paymentRecordId"=${original.id} AND "resolvedAt" IS NULL`;
      } else {
        await tx.paymentRecord.upsert({
          where: { stripePaymentIntentId: receipt.paymentIntentId },
          update: {
            bookingId: original.bookingId,
            userId: original.userId,
            kind: 'NO_SHOW_FEE',
          },
          create: {
            userId: original.userId,
            bookingId: original.bookingId,
            kind: 'NO_SHOW_FEE',
            status: 'SUCCEEDED',
            amountCents: operation.amountCents,
            stripeEventId: `approved-replacement:${operation.id}`,
            stripePaymentIntentId: receipt.paymentIntentId,
            stripeCustomerId: operation.payload.customerId,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: operation.actorId,
          action: 'financial.receipt-reconciled',
          entityType: 'ApprovedFinancialOperation',
          entityId: id,
          after: { receiptId: receipt.id, state },
        },
      });
    }
    const [updated] = await tx.$queryRaw<
      FinancialOperation[]
    >`UPDATE "ApprovedFinancialOperation" SET state=${state},"providerId"=${receipt.id},receipt=${JSON.stringify(receipt)}::jsonb,
      "settledAt"=CASE WHEN ${state}='SUCCEEDED' THEN now() ELSE NULL END WHERE id=${id} RETURNING *`;
    return updated;
  });
}

/** Call within the exact service transaction; rollback keeps the obligation visible. */
export async function confirmAttendanceService(
  tx: FinancialTx,
  bookingId: string,
  paymentIntentId: string,
) {
  await financialLock(tx, bookingId, paymentIntentId);
  await assertUnrefundedAttendanceReceipt(tx, bookingId, paymentIntentId);
  const changed =
    await tx.$executeRaw`UPDATE "AttendanceCollection" SET "serviceConfirmed"=true WHERE "bookingId"=${bookingId} AND "paymentIntentId"=${paymentIntentId} AND state='SUCCEEDED'`;
  if (changed !== 1)
    throw Error('Exact successful collection required to confirm service');
}

/** Caller holds booking ownership through the service transaction or collection admission. */
export async function assertUnrefundedAttendanceReceipt(
  tx: FinancialTx,
  bookingId: string,
  paymentIntentId: string,
) {
  const payment = await tx.paymentRecord.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
  });
  if (
    !payment ||
    payment.bookingId !== bookingId ||
    payment.status !== 'SUCCEEDED' ||
    payment.refundedAmountCents !== 0
  )
    throw Error(
      'Collection receipt is missing or refunded; service cannot use this fee',
    );
  const operations = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "ApprovedFinancialOperation" WHERE "paymentRecordId"=${payment.id} AND kind='REFUND'`;
  if (operations.length)
    throw Error('Refund owns this fee; service cannot complete');
}

/** Human adjudication never grants a new provider submission owner. */
export async function adjudicateFinancialReview(
  db: PrismaClient,
  input: {
    actorId: string;
    reviewId: string;
    expectedVersion: number;
    decision: 'REFRESH_BASIS' | 'INVESTIGATE';
    evidence: string;
    basisKind?: NonNullable<ReviewRow['basis']>['kind'];
  },
) {
  if (
    !['REFRESH_BASIS', 'INVESTIGATE'].includes(input.decision) ||
    input.evidence.trim().length < 16
  )
    throw Error('Specific service/provider investigation evidence required');
  return db.$transaction(async (tx) => {
    await approvedActor(tx, input.actorId);
    const [initial] = await tx.$queryRaw<
      ReviewRow[]
    >`SELECT * FROM "FinancialReview" WHERE id=${input.reviewId}`;
    if (!initial) throw Error('Review missing');
    const payment = await tx.paymentRecord.findUniqueOrThrow({
      where: { id: initial.paymentRecordId },
    });
    if (!payment.stripePaymentIntentId)
      throw Error('Exact payment identity required');
    await financialLock(tx, payment.bookingId, payment.stripePaymentIntentId);
    const [review] = await tx.$queryRaw<
      ReviewRow[]
    >`SELECT * FROM "FinancialReview" WHERE id=${input.reviewId} FOR UPDATE`;
    if (
      !review ||
      review.resolvedAt ||
      review.version !== input.expectedVersion
    )
      throw Error('Review changed; reload before adjudicating');
    const owners = await tx.$queryRaw<
      FinancialOperation[]
    >`SELECT * FROM "ApprovedFinancialOperation" WHERE "paymentRecordId"=${payment.id} AND kind='REFUND'`;
    let basis = review.basis;
    if (input.decision === 'REFRESH_BASIS') {
      if (owners.length)
        throw Error(
          'Permanent operation ownership exists; reconcile or record investigation, never refresh/retry',
        );
      const kind = basis?.kind ?? input.basisKind;
      if (
        !kind ||
        !['PAYMENT_REFUND', 'ATTENDANCE_CORRECTION', 'FAILED_SERVICE'].includes(
          kind,
        )
      )
        throw Error('Legacy basis requires an explicit service disposition');
      basis = { kind, snapshot: await refundReviewSnapshot(tx, payment) };
      // A successful service winner must not be relabeled a failed-service case.
      await validateReviewBasis(tx, { ...review, basis }, payment);
      await tx.$executeRaw`UPDATE "FinancialReview" SET basis=${JSON.stringify(basis)}::jsonb,version=version+1 WHERE id=${review.id}`;
    }
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: 'financial.review-adjudicated',
        entityType: 'FinancialReview',
        entityId: review.id,
        before: {
          version: review.version,
          basis: review.basis as Prisma.InputJsonValue,
        },
        after: {
          version:
            review.version + (input.decision === 'REFRESH_BASIS' ? 1 : 0),
          basis: basis as Prisma.InputJsonValue,
          decision: input.decision,
          evidence: input.evidence.trim(),
        },
      },
    });
    return {
      refreshed: input.decision === 'REFRESH_BASIS',
      ownershipRetained: owners.length > 0,
    };
  });
}

/** A subscription can have many receipts on one purchase. Never choose findFirst. */
export async function originalPurchaseRefundPayment(
  db: PrismaClient,
  purchaseId: string,
  memberId?: string,
) {
  const purchase = await db.purchase.findUniqueOrThrow({
    where: { id: purchaseId },
  });
  if (memberId && purchase.userId !== memberId)
    throw Error('Purchase belongs to another member');
  if (!purchase.stripePaymentIntentId)
    throw Error('Original payment identity missing');
  const payment = await db.paymentRecord.findUnique({
    where: { stripePaymentIntentId: purchase.stripePaymentIntentId },
  });
  if (
    !payment ||
    payment.purchaseId !== purchase.id ||
    payment.userId !== purchase.userId
  )
    throw Error('Original purchase receipt binding mismatch');
  return payment;
}
export async function recordCollectionInvestigation(
  db: PrismaClient,
  input: { actorId: string; bookingId: string; evidence: string },
) {
  if (input.evidence.trim().length < 16)
    throw Error('Specific investigation evidence required');
  return db.$transaction(async (tx) => {
    await approvedActor(tx, input.actorId);
    await financialLock(
      tx,
      input.bookingId,
      `collection-review:${input.bookingId}`,
    );
    const [collection] = await tx.$queryRaw<
      { state: string; paymentIntentId: string | null }[]
    >`SELECT state,"paymentIntentId" FROM "AttendanceCollection" WHERE "bookingId"=${input.bookingId}`;
    if (!collection) throw Error('Collection missing');
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: 'financial.collection-investigated',
        entityType: 'Booking',
        entityId: input.bookingId,
        before: collection,
        after: { evidence: input.evidence.trim(), ownershipRetained: true },
      },
    });
  });
}
