import { adjustmentIntent, readEventCaptureProof } from '@/lib/payments/event-capture-evidence';
import { financialLock } from '@/lib/payments/refund-review';
import { reconcileVipRenewalStripeEvent } from '@/lib/domain/bookings/vip-renewal-continuity';
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

// Do not log provider messages, payloads, keys, addresses or arbitrary error codes.
// Runtime logs preserve the failure stage after a successful retry clears the DB error.
function logFailure(event: Stripe.Event, phase: string, error: unknown) {
  const safeCodes = new Set([
    'RECEIPT_REFRESH_SUPERSEDED', 'P2002', 'P2024', 'P2028', 'P2034',
    'ECONNRESET', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT',
    'StripeAPIError', 'StripeConnectionError', 'StripeRateLimitError', 'StripeAuthenticationError',
  ]);
  const details = error && typeof error === 'object' ? error as { code?: unknown; type?: unknown } : {};
  const code = [details.code, details.type].find(value => typeof value === 'string' && safeCodes.has(value));
  console.error('stripe-webhook failure', { eventId: event.id, eventType: event.type, phase, code: code || 'UNCLASSIFIED' });
}

async function retainSignedEvent(event: Stripe.Event, rawBody: string, error?: string) {
  const receipt = {where:{id:event.id}, update:error?{error}:{},
    create:{id:event.id,type:event.type,payload:JSON.parse(rawBody),...(error?{error}:{})}};
  const intent = adjustmentIntent(event);
  if (!intent) return prisma.stripeEvent.upsert(receipt);
  return retrySerializableTransaction(() => prisma.$transaction(async tx => {
    await financialLock(tx,null,intent);
    // Physical versions invalidate a paid transaction that began on an older snapshot.
    await tx.$executeRaw`SELECT bf_lock_checkout_evidence(NULL,${intent},NULL)`;
    const retained = await tx.stripeEvent.upsert(receipt);
    // A checkout that won admission immediately before the adjustment keeps its
    // financial history; the private review removes its eligibility immediately.
    const rows = await tx.$queryRaw<{id:string}[]>`UPDATE "CommerceOrder" o SET status='FULFILLMENT_REVIEW'
      WHERE o."stripePaymentIntentId"=${intent} AND o.kind='EVENT' AND o.status='PAID'
      AND bf_special_occurrence(o."occurrenceId")
      AND NOT EXISTS (SELECT 1 FROM "BlackFridayTicket" t WHERE t."orderId"=o.id)
      RETURNING o.id`;
    for (const row of rows) await tx.emailMessage.updateMany({where:{
      dedupeKey:'commerce-confirmation:'+row.id,status:'QUEUED',
    },data:{status:'CANCELLED'}});
    return retained;
  }));
}

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
    } catch (cause) {
      logFailure(event, 'account-verification', cause);
      // Keep signed adjustment evidence visible to the report during provider outages.
      const error = 'Stripe account verification unavailable; retry required.';
      await retainSignedEvent(event,rawBody,error);
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
  await retainSignedEvent(event,rawBody);
  let phase = 'event-hydration';
  try {
    const hydratedEvent = await hydrateInvoiceEvent(event, stripe.invoices);
    if (account) assertReceiptEventScope(hydratedEvent, account);
    if ((hydratedEvent.data.object as { id?: string }).id !== (event.data.object as { id?: string }).id) throw new Error('Hydrated Stripe object identity mismatch.');
    phase = 'fulfillment';
    const proof = !duplicate && (event.type==='checkout.session.completed' || event.type==='checkout.session.async_payment_succeeded')
      ? await readEventCaptureProof(prisma,stripe,event.data.object,account ?? undefined) : undefined;
    if (!duplicate) await retrySerializableTransaction(() =>
      prisma.$transaction(
        async (tx) => {
          // Recheck inside the serializable transaction so concurrent deliveries cannot replay fulfillment.
          const current = await tx.stripeEvent.findUnique({ where: { id: event.id } });
          if (current?.processedAt) return;
          await processStripeEvent(tx, hydratedEvent, proof);
          await tx.stripeEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), error: null } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
    phase = 'vip-renewal-reservations';
    await reconcileVipRenewalStripeEvent(prisma, hydratedEvent);
    if (account && eventNeedsReceipt(event)) {
      phase = 'receipt-refresh';
      await refreshStripeEventReceipt(prisma, stripe, hydratedEvent, account);
      await prisma.stripeEvent.update({ where: { id: event.id }, data: { error: null } });
    }
  } catch (error) {
    logFailure(event, phase, error);
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
