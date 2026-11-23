import type { CommerceOrder, Prisma, PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { specialEventIdentity } from './black-friday-new-friend';

type Tx = Prisma.TransactionClient;
export type EventCaptureProof = { accountId: string; charge: Stripe.Charge };

const objectId = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : value?.id;
const ownershipKeys = [
  'purchaseType',
  'commerceOrderId',
  'occurrenceId',
  'userId',
  'blackFridayTicket',
];
const conflictingOwner = (metadata: Stripe.Metadata | null | undefined) =>
  Boolean(
    metadata?.purchaseId ||
    metadata?.membershipId ||
    metadata?.bookingId ||
    metadata?.subscriptionId,
  );

export function assertEventCapture(
  session: Stripe.Checkout.Session,
  charge: Stripe.Charge,
) {
  const intent = session.payment_intent;
  if (
    !session.metadata ||
    session.mode !== 'payment' ||
    session.status !== 'complete' ||
    session.payment_status !== 'paid' ||
    typeof session.livemode !== 'boolean' ||
    charge.livemode !== session.livemode ||
    !charge.id ||
    !objectId(intent) ||
    objectId(intent) !== objectId(charge.payment_intent) ||
    !charge.paid ||
    !charge.captured ||
    charge.status !== 'succeeded' ||
    charge.refunded !== false ||
    charge.disputed !== false ||
    charge.amount_refunded !== 0 ||
    charge.amount_captured !== session.amount_total ||
    charge.amount !== session.amount_total ||
    charge.currency !== session.currency ||
    conflictingOwner(charge.metadata) ||
    conflictingOwner(session.metadata) ||
    ownershipKeys.some(
      (key) =>
        charge.metadata?.[key] !== undefined &&
        charge.metadata[key] !== session.metadata?.[key],
    ) ||
    (intent &&
      typeof intent !== 'string' &&
      (intent.status !== 'succeeded' ||
        intent.livemode !== session.livemode ||
        intent.amount !== session.amount_total ||
        intent.amount_received !== session.amount_total ||
        intent.currency !== session.currency ||
        objectId(intent.latest_charge) !== charge.id ||
        conflictingOwner(intent.metadata) ||
        ownershipKeys.some(
          (key) => intent.metadata?.[key] !== session.metadata?.[key],
        )))
  )
    throw Error('Event capture provenance requires review.');
}

/** The webhook and buyer/staff reconciliation may race the hourly writer between its two commits. */
export async function readEventCaptureProof(
  db: PrismaClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  verifiedAccount?: string,
) {
  const pi = objectId(session.payment_intent);
  if (
    !pi ||
    session.payment_status !== 'paid' ||
    !specialEventIdentity(session.metadata?.occurrenceId)
  )
    return;
  const original = await db.paymentRecord.findUnique({
    where: { stripePaymentIntentId: pi },
    select: { commerceOrderId: true },
  });
  if (!original || original.commerceOrderId) return;
  const options = { timeout: 2500, maxNetworkRetries: 0 };
  const accountId =
    verifiedAccount ?? (await stripe.accounts.retrieve({}, options)).id;
  const intent = session.payment_intent;
  const expanded =
    typeof intent === 'object' &&
    intent &&
    typeof intent.latest_charge === 'object' &&
    intent.latest_charge
      ? intent
      : await stripe.paymentIntents.retrieve(
          pi,
          { expand: ['latest_charge'] },
          options,
        );
  const charge = expanded.latest_charge;
  if (expanded.id !== pi || !charge || typeof charge === 'string')
    throw Error('Event capture provenance requires review.');
  assertEventCapture({ ...session, payment_intent: expanded }, charge);
  return { accountId, charge };
}

const adjustmentTypes = [
  'charge.refunded',
  'charge.refund.updated',
  'refund.created',
  'refund.updated',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
];

export function adjustmentIntent(event: Stripe.Event) {
  return adjustmentTypes.includes(event.type)
    ? objectId(
        (event.data.object as Stripe.Charge | Stripe.Dispute | Stripe.Refund)
          .payment_intent,
      )
    : undefined;
}

export async function retainedEventAdjustment(tx: Tx, intent: string) {
  return Boolean(
    await tx.stripeEvent.findFirst({
      where: {
        type: { in: adjustmentTypes },
        OR: [
          {
            payload: {
              path: ['data', 'object', 'payment_intent'],
              equals: intent,
            },
          },
          {
            payload: {
              path: ['data', 'object', 'payment_intent', 'id'],
              equals: intent,
            },
          },
        ],
      },
      select: { id: true },
    }),
  );
}

/** Bind only the original charge writer's clean, uniquely attributable ledger and stored receipt. */
export async function bindEventPayment(
  tx: Tx,
  order: CommerceOrder,
  session: Stripe.Checkout.Session,
  proof?: EventCaptureProof,
) {
  const pi = objectId(session.payment_intent);
  if (!pi) throw Error('Missing event payment intent.');
  const rows = await tx.paymentRecord.findMany({
    where: {
      OR: [
        { commerceOrderId: order.id },
        { stripePaymentIntentId: pi },
        { stripeCheckoutSessionId: session.id },
      ],
    },
  });
  if (!rows.length) return null;
  const row = rows[0];
  if (
    rows.length !== 1 ||
    !order.userId ||
    row.userId !== order.userId ||
    row.purchaseId ||
    row.membershipId ||
    row.bookingId ||
    row.stripeSubscriptionId ||
    row.stripeInvoiceId ||
    row.stripePaymentIntentId !== pi ||
    row.stripeCheckoutSessionId !== session.id ||
    row.amountCents !== order.amountCents ||
    row.currency !== order.currency ||
    row.status !== 'SUCCEEDED' ||
    row.refundedAmountCents !== 0
  )
    throw Error('Event payment ledger ownership requires review.');
  if (row.kind === 'EVENT' && row.commerceOrderId === order.id) return row;
  if (
    row.commerceOrderId ||
    row.kind !== 'PRODUCT_PURCHASE' ||
    !proof?.accountId ||
    order.stripeCheckoutSessionId !== session.id ||
    order.refundedAmountCents !== 0 ||
    !['PENDING', 'PAYMENT_FAILED'].includes(order.status) ||
    order.paidAt ||
    (await retainedEventAdjustment(tx, pi)) ||
    (await tx.commerceRefund.findFirst({
      where: {
        commerceOrderId: order.id,
        status: { in: ['PENDING', 'SUCCEEDED'] },
      },
    }))
  )
    throw Error('Original event charge ownership requires review.');
  const { charge, accountId } = proof;
  assertEventCapture(session, charge);
  if (
    row.stripeEventId !== 'stripe-sync-charge-' + charge.id ||
    row.occurredAt.getTime() !== charge.created * 1000
  )
    throw Error('Original event charge identity requires review.');
  const receiptId = 'rhyze-payment-reconciled-' + accountId + '-' + charge.id;
  const expected = {
    id: receiptId,
    type: 'rhyze.payment.reconciled',
    account: accountId,
    livemode: session.livemode,
    data: {
      object: {
        id: charge.id,
        object: 'charge',
        payment_intent: pi,
        status: 'succeeded',
        paid: true,
        captured: true,
        refunded: false,
        disputed: false,
        amount: order.amountCents,
        amount_captured: order.amountCents,
        amount_refunded: 0,
        currency: order.currency,
        created: charge.created,
      },
    },
  };
  const matches = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "StripeEvent" WHERE id=${receiptId}
    AND type='rhyze.payment.reconciled' AND "processedAt" IS NOT NULL AND error IS NULL
    AND payload @> ${JSON.stringify(expected)}::jsonb
    AND payload #> '{data,object,refunds,data}'='[]'::jsonb AND payload #> '{data,object,disputes,data}'='[]'::jsonb
    AND NOT EXISTS (SELECT 1 FROM "StripeEvent" other WHERE other.id<>${receiptId}
      AND other.type IN ('rhyze.payment.reconciled','rhyze.payment.reconciliation-pending')
      AND (other.payload #>> '{data,object,payment_intent}'=${pi} OR other.payload #>> '{data,object,id}'=${charge.id}))
    FOR SHARE`;
  if (matches.length !== 1)
    throw Error('Original event charge receipt requires review.');
  return tx.paymentRecord.update({
    where: { id: row.id },
    data: { kind: 'EVENT', commerceOrderId: order.id },
  });
}
