import type Stripe from 'stripe';
import type { PrismaClient } from '@prisma/client';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';
import { processStripeEvent } from '@/lib/payments/webhook-processor';

const DEFAULT_LOOKBACK_DAYS = 7;

function fromUnix(seconds: number | null | undefined) {
  return seconds ? new Date(seconds * 1000) : new Date();
}

function paymentStatus(charge: Stripe.Charge): 'SUCCEEDED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'DISPUTED' {
  if (charge.disputed) return 'DISPUTED';
  if (charge.amount_refunded >= charge.amount) return 'REFUNDED';
  if (charge.amount_refunded > 0) return 'PARTIALLY_REFUNDED';
  return 'SUCCEEDED';
}

function emailFromCharge(charge: Stripe.Charge) {
  return (
    charge.billing_details?.email ||
    (typeof charge.metadata?.customerEmail === 'string' ? charge.metadata.customerEmail : null) ||
    (typeof charge.metadata?.email === 'string' ? charge.metadata.email : null) ||
    null
  );
}

function nameFromCharge(charge: Stripe.Charge) {
  return (
    charge.billing_details?.name ||
    (typeof charge.metadata?.customerName === 'string' ? charge.metadata.customerName : null) ||
    null
  );
}

function paymentIntentIdentifier(charge: Stripe.Charge) {
  const intent = charge.payment_intent;
  if (typeof intent === 'string') return intent;
  if (intent?.id) return intent.id;
  return `charge_${charge.id}`;
}

export async function paidCheckoutSessionForPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string,
) {
  if (paymentIntentId.startsWith('charge_')) return null;
  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  } as Stripe.Checkout.SessionListParams);
  const session = sessions.data[0];
  if (!session || session.payment_status !== 'paid') return null;
  if (!session.metadata?.purchaseId && !session.metadata?.commerceOrderId) return null;
  return session;
}

export function syntheticCheckoutEvent(session: Stripe.Checkout.Session, charge: Stripe.Charge) {
  return {
    id: `stripe-sync-checkout-${session.id}`,
    type: 'checkout.session.completed',
    created: session.created || charge.created,
    data: { object: session },
  } as Stripe.Event;
}

export async function syncRecentStripePaymentRecords(
  prisma: PrismaClient,
  options: { lookbackDays?: number; limit?: number } = {},
) {
  if (!stripeIsConfigured()) return { attempted: false, synced: 0, reason: 'stripe-unconfigured' };

  const stripe = getStripe();
  const createdGte = Math.floor(
    (Date.now() - (options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS) * 24 * 60 * 60 * 1000) / 1000,
  );
  const [account, charges] = await Promise.all([
    stripe.accounts.retrieve(),
    stripe.charges.list({
      created: { gte: createdGte },
      limit: options.limit ?? 100,
    }),
  ]);

  const diagnostics = {
    account: account.id,
    chargeCount: charges.data.length,
    liveCharges: charges.data.filter((charge) => charge.livemode).length,
    testCharges: charges.data.filter((charge) => !charge.livemode).length,
    paidUsdCharges: charges.data.filter((charge) => charge.paid && charge.currency.toLowerCase() === 'usd').length,
    newestChargeAt: charges.data[0]?.created ? fromUnix(charges.data[0].created).toISOString() : null,
  };
  const sombleBackedPaymentIds = new Set(
    (
      await prisma.sombleTransaction.findMany({
        where: { paymentId: { in: charges.data.map((charge) => charge.id) } },
        select: { paymentId: true },
      })
    ).map((transaction) => transaction.paymentId),
  );

  let synced = 0;
  let fulfilledCheckoutSessions = 0;
  let skippedSombleBacked = 0;
  for (const charge of charges.data) {
    if (!charge.paid || charge.currency.toLowerCase() !== 'usd') continue;
    if (sombleBackedPaymentIds.has(charge.id)) {
      skippedSombleBacked += 1;
      continue;
    }
    const customerEmail = emailFromCharge(charge);
    const customerName = nameFromCharge(charge);
    const user = customerEmail
      ? await prisma.user.findFirst({
          where: { email: { equals: customerEmail, mode: 'insensitive' } },
          select: { id: true },
        })
      : null;
    const status = paymentStatus(charge);
    const paymentIntentId = paymentIntentIdentifier(charge);

    const checkoutSession = await paidCheckoutSessionForPaymentIntent(stripe, paymentIntentId);
    const existingPaymentRecord = await prisma.paymentRecord.findFirst({
      where: {
        OR: [
          { stripePaymentIntentId: paymentIntentId },
          { stripeEventId: `stripe-sync-charge-${charge.id}` },
          ...(checkoutSession ? [{ stripeCheckoutSessionId: checkoutSession.id }] : []),
        ],
      },
      select: { id: true },
    });
    const paymentRecordData = {
      status,
      amountCents: charge.amount_captured || charge.amount,
      refundedAmountCents: charge.amount_refunded,
      receiptUrl: charge.receipt_url || null,
      occurredAt: fromUnix(charge.created),
      customerName,
      customerEmail,
      stripeCustomerId: typeof charge.customer === 'string' ? charge.customer : charge.customer?.id || null,
      stripeCheckoutSessionId: checkoutSession?.id || null,
      ...(user ? { userId: user.id } : {}),
    };
    if (existingPaymentRecord) {
      await prisma.paymentRecord.update({
        where: { id: existingPaymentRecord.id },
        data: paymentRecordData,
      });
    } else {
      await prisma.paymentRecord.create({
        data: {
          ...paymentRecordData,
          userId: user?.id || null,
          kind: 'PRODUCT_PURCHASE',
          currency: charge.currency.toLowerCase(),
          stripeEventId: `stripe-sync-charge-${charge.id}`,
          stripePaymentIntentId: paymentIntentId,
        },
      });
    }
    if (checkoutSession) {
      await prisma.$transaction(async (tx) => {
        await processStripeEvent(tx, syntheticCheckoutEvent(checkoutSession, charge));
      });
      fulfilledCheckoutSessions += 1;
    }
    synced += 1;
  }

  return { attempted: true, synced, fulfilledCheckoutSessions, skippedSombleBacked, ...diagnostics };
}
