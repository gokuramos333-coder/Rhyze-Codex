'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireApprovedOwner, requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';
import { queueEmail } from '@/lib/notifications/email-queue';
import { linkStripePaymentRecordToMember } from '@/lib/admin/stripe-payment-linking';
import { syncRecentStripePaymentRecords } from '@/lib/payments/stripe-payment-sync';
import { CommerceRefundError, refundCommerceOrderFullRemainder } from '@/lib/payments/commerce-refunds';

function adminPaymentsPath(result?: string) {
  return `/admin/payments${result ? `?result=${result}` : ''}#native-payment-records`;
}

function commerceRefundResult(error: unknown) {
  const code = error instanceof CommerceRefundError
    ? error.code
    : typeof error === 'object' && error && 'code' in error
      ? (error as { code?: unknown }).code
      : null;
  if (code === 'provider_pending') return 'refund-pending';
  if (code === 'provider_failed') return 'refund-failed';
  if (code === 'provider_mismatch') return 'refund-provider-mismatch';
  if (code === 'not_refundable') return 'refund-review';
  return 'refund-error';
}

export async function refreshStripePaymentsAction() {
  await requireArea('admin');
  try {
    await syncRecentStripePaymentRecords(prisma, { lookbackDays: 14, limit: 100 });
  } catch (error) {
    console.error('Manual Stripe payment sync failed', error);
    redirect(adminPaymentsPath('sync-error'));
  }
  revalidatePath('/admin/payments');
  revalidatePath('/admin');
  revalidatePath('/admin/activity');
  revalidatePath('/admin/events');
  redirect(adminPaymentsPath('refreshed'));
}

export async function linkPaymentRecordToMemberAction(formData: FormData) {
  const actor = await requireArea('admin');
  const paymentRecordId = String(formData.get('paymentRecordId') || '');
  const memberEmail = String(formData.get('memberEmail') || '').trim();
  const linkMode = String(formData.get('linkMode') || 'record-only');
  if (!paymentRecordId || !memberEmail) return;

  const result = await prisma.$transaction((tx) =>
    linkStripePaymentRecordToMember(tx, {
      paymentRecordId,
      memberEmail,
      actorId: actor.id,
      grantIntroTrial: linkMode === 'intro-trial',
      note: 'Admin linked studio Stripe payment from Sales page',
    }),
  );

  revalidatePath('/admin/payments');
  revalidatePath('/admin/activity');
  revalidatePath('/admin');
  if (result.ok) {
    revalidatePath(`/admin/members/${result.memberId}`);
    revalidatePath('/member');
    revalidatePath('/member/membership');
  }
}

export async function refundPurchaseAction(formData: FormData) {
  await requireArea('admin');
  const purchaseId = String(formData.get('purchaseId') || '');
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } },
    include: { user: true, product: true, membership: true },
  });
  const refundableAmount = purchase ? purchase.amountCents - purchase.refundedAmountCents : 0;
  if (!purchase || !purchase.stripePaymentIntentId || refundableAmount <= 0 || !stripeIsConfigured()) return;
  const refund = await getStripe().refunds.create(
    { payment_intent: purchase.stripePaymentIntentId, amount: refundableAmount },
    { idempotencyKey: `admin-payment-refund-${purchase.id}-${purchase.refundedAmountCents}` },
  );
  const closedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.refund.create({ data: { purchaseId, amountCents: refundableAmount, stripeRefundId: refund.id, reason: 'Admin full refund' } });
    await tx.purchase.update({ where: { id: purchaseId }, data: { status: 'REFUNDED', refundedAmountCents: purchase.amountCents } });
    await tx.paymentRecord.updateMany({
      where: { stripePaymentIntentId: purchase.stripePaymentIntentId },
      data: { status: 'REFUNDED', refundedAmountCents: purchase.amountCents },
    });
    await tx.membership.updateMany({ where: { purchaseId }, data: { status: 'CANCELLED', cancelAtPeriodEnd: false, currentPeriodEnd: closedAt } });
    await tx.creditAccount.updateMany({ where: { sourcePurchaseId: purchaseId }, data: { validUntil: closedAt } });
    await tx.referralCommission.updateMany({ where: { purchaseId }, data: { status: 'REVERSED', reversedAt: closedAt } });
    await queueEmail(tx, {
      userId: purchase.userId,
      to: purchase.user.email,
      subject: 'Your Rhyze refund was issued',
      template: 'PAYMENT_REFUND_CONFIRMATION',
      payload: {
        name: purchase.user.name || 'Rhyzer',
        itemName: purchase.product.name,
        amount: refundableAmount,
        billingUrl: '/member/billing',
      },
      dedupeKey: `refund-confirmation:${refund.id}`,
    });
  });
  revalidatePath('/admin/payments');
  revalidatePath('/admin/activity');
  revalidatePath('/admin');
  revalidatePath(`/admin/members/${purchase.userId}`);
  revalidatePath('/member');
  revalidatePath('/member/membership');
}

export async function refundCommerceOrderAction(formData: FormData) {
  const actor = await requireApprovedOwner();
  const orderId = String(formData.get('orderId') || '');
  const reason = String(formData.get('reason') || '').trim();
  const confirmation = String(formData.get('confirmation') || '').trim();
  if (!orderId || !stripeIsConfigured()) {
    redirect(adminPaymentsPath('refund-error'));
  }

  try {
    await refundCommerceOrderFullRemainder(prisma, getStripe(), {
      orderId,
      actorId: actor.id,
      reason,
      confirmation,
    });
  } catch (error) {
    if (!(error instanceof CommerceRefundError)) {
      console.error('Commerce refund failed', {
        orderId,
        message: error instanceof Error ? error.message : 'Unknown refund error',
      });
    }
    redirect(adminPaymentsPath(commerceRefundResult(error)));
  }
  revalidatePath('/admin/payments');
  revalidatePath('/admin/activity');
  revalidatePath('/admin');
  redirect(adminPaymentsPath('refund-issued'));
}
