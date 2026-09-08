import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getStripe } from '@/lib/payments/stripe';
import { hydrateInvoiceEvent } from '@/lib/payments/stripe-event-hydration';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';

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
    const hydratedEvent = await hydrateInvoiceEvent(event, getStripe().invoices);
    await retrySerializableTransaction(() =>
      prisma.$transaction(
        async (tx) => {
          await processStripeEvent(tx, hydratedEvent);
          await tx.stripeEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), error: null } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
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
  return NextResponse.json({ received: true });
}
