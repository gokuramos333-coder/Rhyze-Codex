import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getStripe } from '@/lib/payments/stripe';
import { hydrateInvoiceEvent } from '@/lib/payments/stripe-event-hydration';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';
import { assertReceiptEventScope, eventNeedsReceipt, invalidateKnownStripeEventReceipts, refreshStripeEventReceipt } from '@/lib/payments/stripe-receipt-refresh';
import { requiresLiveStripe } from '@/lib/payments/stripe-mode';

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

  if (requiresLiveStripe() && event.livemode !== true) {
    return NextResponse.json({ received: true, ignored: 'non-live-event' });
  }

  const stripe = getStripe();
  let account: string | null = null;
  if (eventNeedsReceipt(event) || event.account) {
    try {
      account = (await stripe.accounts.retrieve()).id;
    } catch {
      // Keep signed adjustment evidence visible to the report during provider outages.
      const error = 'Stripe account verification unavailable; retry required.';
      await prisma.stripeEvent.upsert({ where: { id: event.id }, update: { error }, create: { id: event.id, type: event.type, payload: JSON.parse(rawBody), error } });
      await invalidateKnownStripeEventReceipts(prisma, event);
      return NextResponse.json({ error }, { status: 500 });
    }
    try {
      assertReceiptEventScope(event, account);
    } catch {
      return NextResponse.json({ error: 'Stripe account or mode verification failed.' }, { status: 400 });
    }
  }

  const existing = await prisma.stripeEvent.findUnique({ where: { id: event.id } });
  const duplicate = Boolean(existing?.processedAt);
  await prisma.stripeEvent.upsert({
    where: { id: event.id },
    update: {},
    create: { id: event.id, type: event.type, payload: JSON.parse(rawBody) },
  });
  try {
    const hydratedEvent = await hydrateInvoiceEvent(event, stripe.invoices);
    if (account) assertReceiptEventScope(hydratedEvent, account);
    if ((hydratedEvent.data.object as { id?: string }).id !== (event.data.object as { id?: string }).id) throw new Error('Hydrated Stripe object identity mismatch.');
    if (!duplicate) await retrySerializableTransaction(() =>
      prisma.$transaction(
        async (tx) => {
          // Recheck inside the serializable transaction so concurrent deliveries cannot replay fulfillment.
          const current = await tx.stripeEvent.findUnique({ where: { id: event.id } });
          if (current?.processedAt) return;
          await processStripeEvent(tx, hydratedEvent);
          await tx.stripeEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), error: null } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
    if (account && eventNeedsReceipt(event)) {
      await refreshStripeEventReceipt(prisma, stripe, hydratedEvent, account);
      await prisma.stripeEvent.update({ where: { id: event.id }, data: { error: null } });
    }
  } catch (error) {
    await prisma.stripeEvent.update({
      where: { id: event.id },
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
    return NextResponse.json({ error: 'Processing failed.' }, { status: 500 });
  }
  const object = event.data.object as { metadata?: { occurrenceId?: string } };
  revalidatePath('/admin');
  revalidatePath('/admin/activity');
  revalidatePath('/admin/payments');
  revalidatePath('/instructor/schedule');
  if (object.metadata?.occurrenceId) {
    revalidatePath(`/instructor/classes/${object.metadata.occurrenceId}/roster`);
    revalidatePath(`/admin/schedule/${object.metadata.occurrenceId}/roster`);
  }
  return NextResponse.json({ received: true, ...(duplicate ? { duplicate: true } : {}) });
}
