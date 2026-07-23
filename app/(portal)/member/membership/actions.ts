'use server';

import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';

export async function startCheckoutAction(formData: FormData) {
  const user = await requireArea('member');
  const productId = String(formData.get('productId') || '');
  const product = await prisma.product.findFirst({ where: { id: productId, isActive: true, isPublic: true } });
  if (!product) redirect('/member/membership?result=unavailable');
  if (!stripeIsConfigured() || !product.stripePriceId) redirect('/member/membership?result=stripe');

  const purchase = await prisma.purchase.create({
    data: { userId: user.id, productId: product.id, amountCents: product.priceCents },
  });
  const stripe = getStripe();
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
  const checkout = await stripe.checkout.sessions.create({
    mode: product.billingInterval === 'ONE_TIME' ? 'payment' : 'subscription',
    line_items: [{ price: product.stripePriceId!, quantity: 1 }],
    customer_email: user.email,
    client_reference_id: purchase.id,
    metadata: { purchaseId: purchase.id, productId: product.id, userId: user.id },
    success_url: `${origin}/member/membership?result=success`,
    cancel_url: `${origin}/member/membership?result=cancelled`,
  }, { idempotencyKey: `checkout-${purchase.id}` });
  await prisma.purchase.update({ where: { id: purchase.id }, data: { stripeCheckoutSessionId: checkout.id } });
  redirect(checkout.url!);
}
