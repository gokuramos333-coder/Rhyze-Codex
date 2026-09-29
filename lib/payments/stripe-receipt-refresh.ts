import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';
import type { PrismaClient } from '@prisma/client';
import { financialReceipt } from '@/lib/payments/stripe-payment-sync';
import { assertStripeObjectMode } from '@/lib/payments/stripe-mode';
import { stripeAccountMode } from '@/lib/payments/stripe';

const pendingType = 'rhyze.payment.reconciliation-pending';
function idOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  return value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof value.id === 'string'
    ? value.id
    : null;
}
function assertMode(object: { livemode?: boolean }, live: boolean) {
  assertStripeObjectMode(object);
  if (object.livemode !== live)
    throw new Error('Stripe object mode does not match the signed event.');
}
export function assertReceiptEventScope(event: Stripe.Event, account: string) {
  assertMode(event, stripeAccountMode() === 'live');
  if (event.account && event.account !== account)
    throw new Error(
      'Connected account event does not belong to this Stripe account.',
    );
  const object = event.data.object;
  if ('livemode' in object) assertMode(object, event.livemode);
}
export function eventNeedsReceipt(event: Stripe.Event) {
  return (
    /^(charge\.|refund\.|payment_intent\.)/.test(event.type) ||
    [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'invoice.paid',
    ].includes(event.type)
  );
}

/** Signed evidence can invalidate a known receipt even while Stripe account lookup is down. */
export async function invalidateKnownStripeEventReceipts(
  prisma: PrismaClient,
  event: Stripe.Event,
) {
  const object = event.data.object as unknown as {
    id: string;
    object?: string;
    charge?: unknown;
    latest_charge?: unknown;
    payment_intent?: unknown;
  };
  const chargeId =
    object.object === 'charge'
      ? object.id
      : idOf(object.charge) || idOf(object.latest_charge);
  const intentId =
    object.object === 'payment_intent'
      ? object.id
      : idOf(object.payment_intent);
  if (!chargeId && !intentId) return;
  await prisma.stripeEvent.updateMany({
    where: {
      type: { in: ['rhyze.payment.reconciled', pendingType] },
      AND: [
        { payload: { path: ['livemode'], equals: event.livemode } },
        ...(event.account
          ? [{ payload: { path: ['account'], equals: event.account } }]
          : []),
        {
          payload: {
            path: ['data', 'object', chargeId ? 'id' : 'payment_intent'],
            equals: chargeId || intentId!,
          },
        },
      ],
    },
    data: { type: pendingType, error: randomUUID() },
  });
}

/** Only provider receipts are written. Never replay payment, entitlement, or email processing. */
export async function refreshStripeEventReceipt(
  prisma: PrismaClient,
  stripe: Stripe,
  event: Stripe.Event,
  account: string,
) {
  assertReceiptEventScope(event, account);
  if (!eventNeedsReceipt(event)) return;
  const object = event.data.object as unknown as {
    id: string;
    object?: string;
    charge?: unknown;
    payment_intent?: unknown;
    invoice?: unknown;
    latest_charge?: unknown;
    payments?: {
      data: Array<{
        livemode?: boolean;
        invoice?: unknown;
        payment: { type: string; payment_intent?: unknown; charge?: unknown };
      }>;
      has_more: boolean;
    };
  };
  let chargeId =
    event.type.startsWith('charge.') &&
    !event.type.startsWith('charge.dispute.') &&
    !event.type.startsWith('charge.refund.')
      ? object.id
      : idOf(object.charge);
  const intents = new Set<string>();
  const intentId = event.type.startsWith('payment_intent.')
    ? object.id
    : idOf(object.payment_intent);
  if (intentId) intents.add(intentId);
  const invoiceCharges = new Set<string>();
  if (event.type === 'invoice.paid') {
    let payments = object.payments?.data || [];
    if (object.payments?.has_more) {
      payments = [];
      let cursor: string | undefined;
      for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
        const page = await stripe.invoicePayments.list({
          invoice: object.id,
          limit: 100,
          ...(cursor ? { starting_after: cursor } : {}),
        });
        payments.push(...page.data);
        if (!page.has_more) break;
        const next = page.data.at(-1)?.id;
        if (pageNumber === 9 || !next || next === cursor)
          throw new Error('Invoice payment pagination is incomplete.');
        cursor = next;
      }
    }
    for (const entry of payments) {
      if (entry.livemode !== undefined) assertMode(entry, event.livemode);
      if (entry.invoice && idOf(entry.invoice) !== object.id)
        throw new Error('Invoice payment belongs to a different invoice.');
      const id =
        entry.payment.type === 'payment_intent' &&
        idOf(entry.payment.payment_intent);
      if (id) intents.add(id);
      const directCharge =
        entry.payment.type === 'charge' && idOf(entry.payment.charge);
      if (directCharge) invoiceCharges.add(directCharge);
    }
  }
  if (
    !chargeId &&
    !intents.size &&
    event.type.startsWith('checkout.') &&
    idOf(object.invoice)
  ) {
    const invoice = await stripe.invoices.retrieve(idOf(object.invoice)!, {
      expand: ['payments.data.payment'],
    });
    assertMode(invoice, event.livemode);
    if (invoice.id !== idOf(object.invoice))
      throw new Error(
        'Provider invoice identity does not match the signed event.',
      );
    return refreshStripeEventReceipt(
      prisma,
      stripe,
      {
        ...event,
        type: 'invoice.paid',
        data: { ...event.data, object: invoice },
      } as Stripe.Event,
      account,
    );
  }
  const refreshCharge = async (id: string, expectedIntent: string | null) => {
    const receiptId = `rhyze-payment-reconciled-${account}-${id}`;
    const token = randomUUID();
    // Persist invalidation before a provider read. A failed read keeps prior amounts visible
    // as stale evidence instead of silently retaining their old verification status.
    const pending = await prisma.stripeEvent.upsert({
      where: { id: receiptId },
      create: {
        id: receiptId,
        type: pendingType,
        error: token,
        payload: {
          account,
          livemode: event.livemode,
          data: { object: { id, payment_intent: expectedIntent } },
        },
      },
      update: { type: pendingType, error: token },
    });
    const charge = await stripe.charges.retrieve(id, {
      expand: ['balance_transaction'],
    });
    assertMode(charge, event.livemode);
    if (
      charge.id !== id ||
      (expectedIntent && idOf(charge.payment_intent) !== expectedIntent)
    )
      throw new Error(
        'Provider charge identity does not match the signed event.',
      );
    const receipt = await financialReceipt(
      stripe,
      account,
      charge,
      event.livemode,
    );
    const prior = pending.payload as { acknowledgedEventIds?: string[] } | null;
    receipt.payload.acknowledgedEventIds = [
      ...new Set([...(prior?.acknowledgedEventIds || []), event.id]),
    ].slice(-100);
    // A slower concurrent refresh must not overwrite the result of a newer provider read.
    const saved = await prisma.stripeEvent.updateMany({
      where: { id: receiptId, type: pendingType, error: token },
      data: { ...receipt, error: null },
    });
    if (saved.count !== 1)
      throw new Error(
        'Receipt refresh was superseded; retry the signed event.',
      );
  };
  if (chargeId) {
    await refreshCharge(chargeId, intentId);
    return;
  }
  for (const id of invoiceCharges) await refreshCharge(id, null);
  for (const id of intents) {
    // Invalidate by intent before resolving latest_charge, which may itself fail.
    await prisma.stripeEvent.updateMany({
      where: {
        type: { in: ['rhyze.payment.reconciled', pendingType] },
        AND: [
          { payload: { path: ['account'], equals: account } },
          {
            payload: { path: ['data', 'object', 'payment_intent'], equals: id },
          },
        ],
      },
      data: { type: pendingType, error: randomUUID() },
    });
    const intent = await stripe.paymentIntents.retrieve(id);
    assertMode(intent, event.livemode);
    if (intent.id !== id)
      throw new Error(
        'Provider intent identity does not match the signed event.',
      );
    chargeId = idOf(intent.latest_charge);
    if (chargeId) await refreshCharge(chargeId, id);
  }
}
