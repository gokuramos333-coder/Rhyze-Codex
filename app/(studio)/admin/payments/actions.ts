'use server';

import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';

export async function refundPurchaseAction(formData: FormData) {
  await requireArea('admin');
  const purchaseId = String(formData.get('purchaseId') || '');
  const purchase = await prisma.purchase.findFirst({ where: { id: purchaseId, status: 'PAID' } });
  if (!purchase || !purchase.stripePaymentIntentId || !stripeIsConfigured()) return;
  const refund = await getStripe().refunds.create({ payment_intent: purchase.stripePaymentIntentId });
  await prisma.$transaction([
    prisma.refund.create({ data: { purchaseId, amountCents: purchase.amountCents, stripeRefundId: refund.id, reason: 'Admin refund' } }),
    prisma.purchase.update({ where: { id: purchaseId }, data: { status: 'REFUNDED', refundedAmountCents: purchase.amountCents } }),
    prisma.referralCommission.updateMany({ where: { purchaseId }, data: { status: 'REVERSED', reversedAt: new Date() } }),
  ]);
  revalidatePath('/admin/payments');
}
