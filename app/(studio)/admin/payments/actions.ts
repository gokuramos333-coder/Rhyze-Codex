'use server';

import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';
import { queueEmail } from '@/lib/notifications/email-queue';
import { linkStripePaymentRecordToMember } from '@/lib/admin/stripe-payment-linking';

function adminPaymentsPath(result?: string) {
  return `/admin/payments${result ? `?result=${result}` : ''}#native-payment-records`;
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
    await tx.paymentRecord.updateMany({ where: { purchaseId }, data: { status: 'REFUNDED', refundedAmountCents: purchase.amountCents } });
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
  await requireArea('admin');
  const orderId = String(formData.get('orderId') || '');
  const order = await prisma.commerceOrder.findFirst({
    where: { id: orderId, status: { in: ['PAID', 'FULFILLMENT_REVIEW'] } },
    include: { user: true, items: true },
  });
  if (!order?.stripePaymentIntentId || !stripeIsConfigured()) return;

  const refund = await getStripe().refunds.create(
    { payment_intent: order.stripePaymentIntentId },
    { idempotencyKey: `admin-order-refund-${order.id}` },
  );
  await prisma.$transaction(async (tx) => {
    await tx.commerceRefund.create({
      data: {
        commerceOrderId: order.id,
        amountCents: refund.amount,
        stripeRefundId: refund.id,
        reason: 'Admin full refund',
      },
    });
    await tx.commerceOrder.update({
      where: { id: order.id },
      data: { status: 'REFUNDED', refundedAmountCents: refund.amount },
    });
    await tx.paymentRecord.updateMany({
      where: { commerceOrderId: order.id },
      data: { status: 'REFUNDED', refundedAmountCents: refund.amount },
    });
    const recipient = order.user?.email || order.customerEmail;
    if (recipient) {
      await queueEmail(tx, {
        userId: order.userId || undefined,
        to: recipient,
        subject: 'Your Rhyze refund was issued',
        template: 'PAYMENT_REFUND_CONFIRMATION',
        payload: {
          name: order.user?.name || 'Rhyzer',
          itemName: order.items.map((item) => item.name).join(', ') || 'Rhyze purchase',
          amount: refund.amount,
          billingUrl: '/member/billing',
        },
        dedupeKey: `refund-confirmation:${refund.id}`,
      });
    }
  });
  if (order.kind === 'EVENT' && order.occurrenceId && order.userId) {
    await prisma.booking.updateMany({
      where: { occurrenceId: order.occurrenceId, userId: order.userId, source: 'STRIPE_EVENT' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
  }
  revalidatePath('/admin/payments');
}
