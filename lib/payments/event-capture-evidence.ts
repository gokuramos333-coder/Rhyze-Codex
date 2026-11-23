import type {
  CommerceOrder,
  PaymentRecord,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type Stripe from 'stripe';
import { z } from 'zod';
import { specialEventIdentity } from './black-friday-new-friend';

type Tx = Prisma.TransactionClient;
export type EventCaptureProof = {
  accountId: string;
  charge: Stripe.Charge;
  fullRefunds?: Stripe.Refund[];
};

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
    typeof charge.disputed !== 'boolean' ||
    !Number.isSafeInteger(charge.amount_refunded) ||
    charge.amount_refunded < 0 ||
    charge.amount_refunded > charge.amount_captured ||
    charge.refunded !== (charge.amount_refunded === charge.amount_captured) ||
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
    select: {
      id: true,
      commerceOrderId: true,
      commerceOrder: { select: { status: true } },
    },
  });
  if (!original) return;
  if (
    original.commerceOrderId &&
    (session.metadata?.blackFridayTicket !== '1' ||
      original.commerceOrderId !== session.metadata.commerceOrderId ||
      !['FULFILLMENT_REVIEW', 'PARTIALLY_REFUNDED', 'DISPUTED'].includes(
        original.commerceOrder?.status ?? '',
      ) ||
      !(await hasReviewedCapture(db, original.commerceOrderId, original.id)))
  )
    return;
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
  if (charge.refunded && !charge.disputed) {
    const page = await stripe.refunds.list(
      { charge: charge.id, limit: 100 },
      options,
    );
    return {
      accountId,
      charge,
      fullRefunds: page.has_more === false ? page.data : undefined,
    };
  }
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

function retainedIntentWhere(intent: string): Prisma.StripeEventWhereInput {
  return {
    type: { in: adjustmentTypes },
    OR: [
      {
        payload: { path: ['data', 'object', 'payment_intent'], equals: intent },
      },
      {
        payload: {
          path: ['data', 'object', 'payment_intent', 'id'],
          equals: intent,
        },
      },
    ],
  };
}

export async function retainedEventAdjustment(tx: Tx, intent: string) {
  return Boolean(
    await tx.stripeEvent.findFirst({
      where: retainedIntentWhere(intent),
      select: { id: true },
    }),
  );
}

const adjustment = z.object({
  id: z.string().min(1),
  charge: z.string(),
  payment_intent: z.string(),
  currency: z.string(),
  amount: z.number().int().positive(),
  status: z.string().min(1),
});
const receiptAdjustments = z.object({
  refunded: z.boolean(),
  disputed: z.boolean(),
  amount_refunded: z.number().int().nonnegative(),
  refunds: z.object({ data: z.array(adjustment) }),
  disputes: z.object({ data: z.array(adjustment) }),
});

const signedAdjustment = z.object({
  id: z.string(),
  type: z.string(),
  account: z.string().optional(),
  livemode: z.boolean(),
  data: z.object({
    object: z.object({
      id: z.string(),
      currency: z.string(),
      amount: z.number().int().positive(),
      charge: z.union([z.string(), z.object({ id: z.string() })]).optional(),
      livemode: z.boolean().optional(),
      amount_refunded: z.number().int().optional(),
      refunds: z
        .object({ has_more: z.boolean(), data: z.array(z.unknown()) })
        .nullish(),
    }),
  }),
});

type EventRefund = Pick<
  Stripe.Refund,
  'id' | 'payment_intent' | 'currency' | 'amount' | 'status'
>;
type BoundEventPayment = {
  payment: PaymentRecord | null;
  adjustment: { fullRefunds: EventRefund[] | null } | null;
};

async function captureAdjustment(
  tx: Tx,
  proof: EventCaptureProof,
  record: PaymentRecord,
  raw: Prisma.JsonValue,
) {
  const { charge, accountId } = proof;
  const pi = record.stripePaymentIntentId!;
  const receipt = receiptAdjustments.parse(raw);
  const refunds = receipt.refunds.data,
    disputes = receipt.disputes.data;
  const detail = [...refunds, ...disputes];
  if (
    new Set(detail.map((a) => a.id)).size !== detail.length ||
    detail.some(
      (a) =>
        a.charge !== charge.id ||
        a.payment_intent !== pi ||
        a.currency !== record.currency ||
        a.amount > record.amountCents,
    ) ||
    receipt.amount_refunded > record.amountCents ||
    receipt.refunded !== (receipt.amount_refunded === record.amountCents) ||
    refunds
      .filter((r) => r.status === 'succeeded')
      .reduce((n, r) => n + r.amount, 0) !== receipt.amount_refunded ||
    receipt.disputed !== disputes.length > 0
  )
    throw Error('Original event adjustment receipt requires review.');

  const retained = await tx.stripeEvent.findMany({
    where: retainedIntentWhere(pi),
    select: { id: true, type: true, payload: true, error: true },
  });
  let signedDispute = false;
  let terminalPage: unknown[] | undefined = proof.fullRefunds;
  for (const event of retained) {
    const signed = signedAdjustment.parse(event.payload),
      object = signed.data.object;
    const isCharge = event.type === 'charge.refunded';
    if (
      event.error ||
      signed.id !== event.id ||
      signed.type !== event.type ||
      (signed.account && signed.account !== accountId) ||
      signed.livemode !== charge.livemode ||
      (object.livemode !== undefined && object.livemode !== signed.livemode) ||
      (isCharge ? object.id : objectId(object.charge)) !== charge.id ||
      object.currency !== record.currency ||
      (isCharge
        ? object.amount !== record.amountCents
        : object.amount > record.amountCents)
    )
      throw Error('Retained event adjustment identity requires review.');
    signedDispute ||= event.type.startsWith('charge.dispute.');
    if (
      !terminalPage &&
      isCharge &&
      object.amount_refunded === record.amountCents &&
      object.refunds?.has_more === false
    )
      terminalPage = object.refunds.data;
  }

  const adjusted =
    receipt.amount_refunded > 0 ||
    receipt.disputed ||
    detail.length > 0 ||
    record.refundedAmountCents > 0 ||
    record.status !== 'SUCCEEDED' ||
    charge.amount_refunded > 0 ||
    charge.disputed;
  if (!adjusted && !retained.length) return null;
  // A stale clean observation can identify the gross charge, but never restore admission.
  // Without independently retained signed evidence the provider, receipt and ledger must agree.
  const receiptStatus = receipt.disputed
    ? 'DISPUTED'
    : receipt.refunded
      ? 'REFUNDED'
      : receipt.amount_refunded
        ? 'PARTIALLY_REFUNDED'
        : 'SUCCEEDED';
  if (
    !retained.length &&
    (charge.amount_refunded !== receipt.amount_refunded ||
      charge.disputed !== receipt.disputed ||
      record.refundedAmountCents !== receipt.amount_refunded ||
      record.status !== receiptStatus ||
      (!receipt.amount_refunded && !receipt.disputed))
  )
    throw Error('Original event adjustment evidence requires review.');
  // Only complete, individually identified settled refunds may release a special reservation.
  const agreesWithRefundPage =
    terminalPage?.length === refunds.length &&
    new Set(terminalPage.map((raw) => adjustment.safeParse(raw).data?.id))
      .size === refunds.length &&
    terminalPage.every((raw) => {
      const parsed = adjustment.safeParse(raw);
      return (
        parsed.success &&
        refunds.some(
          (r) =>
            r.id === parsed.data.id &&
            r.status === parsed.data.status &&
            r.charge === parsed.data.charge &&
            r.payment_intent === parsed.data.payment_intent &&
            r.amount === parsed.data.amount &&
            r.currency === parsed.data.currency,
        )
      );
    });
  const terminal =
    agreesWithRefundPage &&
    receipt.refunded &&
    !receipt.disputed &&
    !charge.disputed &&
    !signedDispute &&
    record.status !== 'DISPUTED' &&
    (charge.refunded || record.status === 'REFUNDED') &&
    refunds.every((r) =>
      ['succeeded', 'failed', 'canceled'].includes(r.status),
    );
  return {
    fullRefunds: terminal
      ? refunds.map((r) => ({
          ...r,
          status: r.status as Stripe.Refund['status'],
        }))
      : null,
  };
}

/** Bind gross ownership independently of whether this capture qualifies for admission. */
async function hasReviewedCapture(db: Tx, orderId: string, paymentId: string) {
  return Boolean(
    await db.auditLog.findFirst({
      where: {
        entityType: 'CommerceOrder',
        entityId: orderId,
        action: 'black-friday.sync-adjustment-review',
        after: { path: ['paymentRecordId'], equals: paymentId },
      },
      select: { id: true },
    }),
  );
}

export async function bindEventPayment(
  tx: Tx,
  order: CommerceOrder,
  session: Stripe.Checkout.Session,
  proof?: EventCaptureProof,
  completingReview = false,
): Promise<BoundEventPayment> {
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
  const observedReversal =
    proof && (proof.charge.amount_refunded > 0 || proof.charge.disputed);
  if (!rows.length) {
    if (observedReversal)
      throw Error('Original adjusted event charge missing.');
    return { payment: null, adjustment: null };
  }
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
    row.status === 'FAILED' ||
    row.refundedAmountCents < 0 ||
    row.refundedAmountCents > row.amountCents ||
    (row.status === 'SUCCEEDED' && row.refundedAmountCents !== 0) ||
    (row.status === 'REFUNDED' &&
      row.refundedAmountCents !== row.amountCents) ||
    (row.status === 'PARTIALLY_REFUNDED' &&
      !(
        row.refundedAmountCents > 0 && row.refundedAmountCents < row.amountCents
      ))
  )
    throw Error('Event payment ledger ownership requires review.');
  if (completingReview) {
    if (
      row.kind !== 'EVENT' ||
      row.commerceOrderId !== order.id ||
      !order.paidAt ||
      order.stripePaymentIntentId !== pi ||
      !(await hasReviewedCapture(tx, order.id, row.id))
    )
      throw Error('Previously reviewed capture identity changed.');
  } else {
    if (row.kind === 'EVENT' && row.commerceOrderId === order.id) {
      if (observedReversal || row.status !== 'SUCCEEDED')
        throw Error('Event payment ledger ownership requires review.');
      return { payment: row, adjustment: null };
    }
    if (
      row.commerceOrderId ||
      row.kind !== 'PRODUCT_PURCHASE' ||
      order.refundedAmountCents !== 0 ||
      !['PENDING', 'PAYMENT_FAILED'].includes(order.status) ||
      order.paidAt ||
      (await tx.commerceRefund.findFirst({
        where: {
          commerceOrderId: order.id,
          status: { in: ['PENDING', 'SUCCEEDED'] },
        },
      }))
    )
      throw Error('Original event charge ownership requires review.');
  }
  if (!proof?.accountId || order.stripeCheckoutSessionId !== session.id)
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
        amount: order.amountCents,
        amount_captured: order.amountCents,
        currency: order.currency,
        created: charge.created,
      },
    },
  };
  const matches = await tx.$queryRaw<
    { details: Prisma.JsonValue }[]
  >`SELECT payload #> '{data,object}' AS details FROM "StripeEvent" WHERE id=${receiptId}
    AND type='rhyze.payment.reconciled' AND "processedAt" IS NOT NULL AND error IS NULL
    AND payload @> ${JSON.stringify(expected)}::jsonb
    AND NOT EXISTS (SELECT 1 FROM "StripeEvent" other WHERE other.id<>${receiptId}
      AND other.type IN ('rhyze.payment.reconciled','rhyze.payment.reconciliation-pending')
      AND (other.payload #>> '{data,object,payment_intent}'=${pi} OR other.payload #>> '{data,object,id}'=${charge.id}))
    FOR SHARE`;
  if (matches.length !== 1)
    throw Error('Original event charge receipt requires review.');
  const adjustment = await captureAdjustment(
    tx,
    proof,
    row,
    matches[0].details,
  );
  const payment = completingReview
    ? row
    : await tx.paymentRecord.update({
        where: { id: row.id },
        data: { kind: 'EVENT', commerceOrderId: order.id },
      });
  return { payment, adjustment };
}
