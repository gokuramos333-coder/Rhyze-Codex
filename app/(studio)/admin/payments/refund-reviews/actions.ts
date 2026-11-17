'use server';
import { assertFinancialApprover } from '@/lib/auth/financial-owner-access';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getStripe } from '@/lib/payments/stripe';
import {
  approveFinancialOperation,
  adjudicateFinancialReview,
  recordCollectionInvestigation,
  type ReviewRow,
  financialLock,
  reconcileFinancialOperation,
  requestFinancialReview,
} from '@/lib/payments/refund-review';
import { stripeFinancialProvider } from '@/lib/payments/refund-review-stripe';
import type { ReviewCommand } from '@/components/admin/refund-review-queue';
import { revalidatePath } from 'next/cache';
export async function financialReviewAction(
  command: ReviewCommand,
): Promise<string> {
  const actor = await requireApprovedOwner();
  await assertFinancialApprover(prisma, actor.id);
  if (
    !['REFUND', 'REPLACEMENT'].includes(command.kind) ||
    !Number.isSafeInteger(command.amountCents)
  )
    throw Error('Invalid approval');
  const provider = stripeFinancialProvider(getStripe());
  const operation = command.operationId
    ? await reconcileFinancialOperation(prisma, provider, command.operationId)
    : await approveFinancialOperation(prisma, provider, {
        actorId: actor.id,
        paymentRecordId: command.paymentRecordId,
        kind: command.kind,
        reviewId: command.kind === 'REFUND' ? command.id : undefined,
        reviewVersion: command.version,
        expectedAmountCents: command.amountCents,
        reason: command.reason,
        authorizationReference: command.authorizationReference,
      });
  revalidatePath('/admin/payments/refund-reviews');
  revalidatePath('/admin/payments');
  revalidatePath('/admin/activity');
  revalidatePath('/admin');
  if (operation.payload.userId) revalidatePath(`/admin/members/${operation.payload.userId}`);
  return operation.state === 'SUCCEEDED'
    ? 'Receipt independently verified; accounting updated.'
    : `${operation.state}: obligation remains open. Reconcile this operation; do not create another payment.`;
}

export async function openCollectionReviewAction(
  form: FormData,
): Promise<void> {
  const actor = await requireApprovedOwner();
  const bookingId = String(form.get('bookingId') || '');
  await prisma.$transaction(async (tx) => {
    await financialLock(tx, bookingId, `collection-review:${bookingId}`);
    const [collection] = await tx.$queryRaw<
      { paymentIntentId: string | null }[]
    >`SELECT "paymentIntentId" FROM "AttendanceCollection" WHERE "bookingId"=${bookingId} AND NOT "serviceConfirmed"`;
    if (!collection?.paymentIntentId)
      throw Error(
        'Exact provider receipt is not yet known; investigate before approval',
      );
    await requestFinancialReview(tx, {
      paymentIntentId: collection.paymentIntentId,
      requesterId: actor.id,
      basisKind: 'FAILED_SERVICE',
      reason:
        'Owner review of unconfirmed service outcome; verify successful winner before refund approval',
    });
  });
  revalidatePath('/admin/payments/refund-reviews');
}

export async function openPaymentReviewAction(form: FormData): Promise<void> {
  const actor = await requireApprovedOwner();
  const reason = String(form.get('reason') || '').trim();
  if (reason.length < 8) throw Error('Specific review reason required');
  const payment = await prisma.paymentRecord.findUniqueOrThrow({
    where: { id: String(form.get('paymentRecordId') || '') },
  });
  if (!payment.stripePaymentIntentId || payment.commerceOrderId)
    throw Error(
      'Exact non-commerce provider receipt required; commerce refunds use the existing order action',
    );
  await prisma.$transaction((tx) =>
    requestFinancialReview(tx, {
      paymentIntentId: payment.stripePaymentIntentId!,
      requesterId: actor.id,
      reason,
    }),
  );
  revalidatePath('/admin/payments/refund-reviews');
}
export async function adjudicateReviewAction(form: FormData): Promise<void> {
  const actor = await requireApprovedOwner();
  await adjudicateFinancialReview(prisma, {
    actorId: actor.id,
    reviewId: String(form.get('reviewId') || ''),
    expectedVersion: Number(form.get('version')),
    decision: String(form.get('decision')) as 'INVESTIGATE' | 'REFRESH_BASIS',
    evidence: String(form.get('evidence') || ''),
    basisKind: String(form.get('basisKind') || '') as NonNullable<
      ReviewRow['basis']
    >['kind'],
  });
  revalidatePath('/admin/payments/refund-reviews');
}
export async function investigateCollectionAction(
  form: FormData,
): Promise<void> {
  const actor = await requireApprovedOwner();
  await recordCollectionInvestigation(prisma, {
    actorId: actor.id,
    bookingId: String(form.get('bookingId') || ''),
    evidence: String(form.get('evidence') || ''),
  });
  revalidatePath('/admin/payments/refund-reviews');
}
