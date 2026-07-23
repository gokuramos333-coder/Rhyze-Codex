import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma } from '@/lib/db/prisma';
import { getStripe } from '@/lib/payments/stripe';

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 503 });
  }
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const existing = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  if (existing?.processedAt) return NextResponse.json({ received: true, duplicate: true });
  await prisma.stripeEvent.upsert({
    where: { id: event.id },
    update: {},
    create: { id: event.id, type: event.type, payload: JSON.parse(rawBody) },
  });

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const purchaseId = session.metadata?.purchaseId || session.client_reference_id;
      if (purchaseId) {
        const purchase = await prisma.purchase.update({
          where: { id: purchaseId },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
          },
          include: { product: true },
        });
        const number = `RHY-${new Date().getFullYear()}-${purchase.id.slice(-6).toUpperCase()}`;
        await prisma.invoice.upsert({
          where: { purchaseId: purchase.id },
          update: {},
          create: { purchaseId: purchase.id, number, amountCents: purchase.amountCents },
        });
        if (purchase.product.billingInterval !== 'ONE_TIME') {
          await prisma.membership.upsert({
            where: { purchaseId: purchase.id },
            update: { status: 'ACTIVE' },
            create: {
              purchaseId: purchase.id,
              productId: purchase.productId,
              userId: purchase.userId,
              status: 'ACTIVE',
              currentPeriodStart: new Date(),
            },
          });
        } else if (purchase.product.includedCredits || purchase.product.isUnlimited) {
          await prisma.creditAccount.create({
            data: {
              userId: purchase.userId,
              label: purchase.product.name,
              isUnlimited: purchase.product.isUnlimited,
              entries: purchase.product.includedCredits ? { create: { type: 'GRANT', quantity: purchase.product.includedCredits, reason: 'Purchase' } } : undefined,
            },
          });
        }
      }
    }
    await prisma.stripeEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
  } catch (error) {
    await prisma.stripeEvent.update({ where: { id: event.id }, data: { error: error instanceof Error ? error.message : 'Unknown error' } });
    return NextResponse.json({ error: 'Processing failed.' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
