'use server';

import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';
import { referralDiscountCents } from '@/lib/domain/referrals/referral-service';

export async function startCheckoutAction(formData: FormData) {
  const user = await requireArea('member');
  const productId = String(formData.get('productId') || '');
  const product = await prisma.product.findFirst({ where: { id: productId, isActive: true, isPublic: true } });
  if (!product) redirect('/member/membership?result=unavailable');
  if (!stripeIsConfigured() || !product.stripePriceId) redirect('/member/membership?result=stripe');

  const [attribution, redemption] = await Promise.all([
    prisma.referralAttribution.findUnique({ where: { referredUserId: user.id }, include: { referralCode: true } }),
    prisma.discountRedemption.findUnique({ where: { userId: user.id } }),
  ]);
  const discountCents = attribution?.referralCode.isActive && !redemption
    ? referralDiscountCents(product.priceCents)
    : 0;
  const purchase = await prisma.purchase.create({
    data: { userId: user.id, productId: product.id, amountCents: product.priceCents - discountCents, discountCents },
  });
  const stripe = getStripe();
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
  const coupon = discountCents
    ? await stripe.coupons.create(
        { amount_off: discountCents, currency: 'usd', duration: 'once', name: 'Rhyze referral welcome discount' },
        { idempotencyKey: `referral-coupon-${purchase.id}` },
      )
    : null;
  const checkout = await stripe.checkout.sessions.create({
    mode: product.billingInterval === 'ONE_TIME' ? 'payment' : 'subscription',
    customer_creation: product.billingInterval === 'ONE_TIME' ? 'always' : undefined,
    payment_intent_data: product.billingInterval === 'ONE_TIME' ? { setup_future_usage: 'off_session' } : undefined,
    line_items: [{ price: product.stripePriceId!, quantity: 1 }],
    customer_email: user.email,
    client_reference_id: purchase.id,
    metadata: { purchaseId: purchase.id, productId: product.id, userId: user.id, referralCodeId: attribution?.referralCodeId || '' },
    discounts: coupon ? [{ coupon: coupon.id }] : undefined,
    success_url: `${origin}/member/membership?result=success`,
    cancel_url: `${origin}/member/membership?result=cancelled`,
  }, { idempotencyKey: `checkout-${purchase.id}` });
  await prisma.purchase.update({ where: { id: purchase.id }, data: { stripeCheckoutSessionId: checkout.id } });
  redirect(checkout.url!);
}
