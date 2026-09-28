import type { Prisma, PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { eventCancellationCreditKey } from '@/lib/domain/bookings/cancellation-credit';
import { queueEmail } from '@/lib/notifications/email-queue';

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;
type StripeClient = Pick<Stripe, 'paymentIntents' | 'charges' | 'refunds'>;

type RefundOrder = Prisma.CommerceOrderGetPayload<{
  include: {
    user: true;
    items: true;
    occurrence: { include: { template: true } };
    paymentRecords: true;
  };
}>;

export type CommerceRefundInput = {
  orderId: string;
  actorId: string;
  reason: string;
  confirmation: string;
  memberUserId?: string;
  notifyCustomer?: boolean;
};

export type CommerceRefundResult = {
  status: 'SUCCEEDED' | 'ALREADY_REFUNDED';
  orderId: string;
  amountCents: number;
  currency: string;
  stripeRefundId: string | null;
};

export class CommerceRefundError extends Error {
  constructor(
    public code:
      | 'invalid_confirmation'
      | 'invalid_reason'
      | 'not_found'
      | 'not_refundable'
      | 'provider_mismatch'
      | 'provider_pending'
      | 'provider_failed'
      | 'stripe_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'CommerceRefundError';
  }
}

type RefundPage = {
  data: Stripe.Refund[];
  has_more?: boolean;
};

type RefundBookingProof = {
  bookingId: string | null;
};

function isPrismaSerializableConflict(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2034'
  );
}

async function retrySafeSerializableTransaction<T>(
  operation: () => Promise<T>,
) {
  const maximumAttempts = 3;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isPrismaSerializableConflict(error) || attempt === maximumAttempts) {
        throw error;
      }
    }
  }
  throw new Error('Serializable transaction retry exhausted.');
}

function providerId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: unknown }).id);
  }
  return null;
}

function metadataValue(
  object: { metadata?: Stripe.Metadata | null },
  key: string,
) {
  return object.metadata?.[key] || null;
}

function refundStatus(refund: Stripe.Refund) {
  return String(refund.status || '').toUpperCase();
}

function refundAmount(refund: Stripe.Refund) {
  return Number(refund.amount || 0);
}

function isSucceededRefund(refund: Stripe.Refund) {
  return refund.status === 'succeeded';
}

function isPendingRefund(refund: Stripe.Refund) {
  return ['pending', 'requires_action'].includes(String(refund.status || ''));
}

function isFailedRefund(refund: Stripe.Refund) {
  return ['failed', 'canceled'].includes(String(refund.status || ''));
}

function ensureKnownRefundStatus(refund: Stripe.Refund) {
  if (
    !isSucceededRefund(refund) &&
    !isPendingRefund(refund) &&
    !isFailedRefund(refund)
  ) {
    throw new CommerceRefundError(
      'provider_mismatch',
      'Stripe returned a refund with an unknown status.',
    );
  }
}

function ensureProviderRefundMatchesCharge(
  refund: Stripe.Refund,
  params: {
    order: RefundOrder;
    charge: Stripe.Charge;
    paymentIntentId: string;
    expectedAmountCents?: number;
  },
) {
  ensureKnownRefundStatus(refund);
  const refundChargeId = providerId(refund.charge);
  const refundPaymentIntentId = providerId(refund.payment_intent);
  const currency = String(refund.currency || '').toLowerCase();
  const amount = refundAmount(refund);
  if (
    !refund.id ||
    refundChargeId !== params.charge.id ||
    refundPaymentIntentId !== params.paymentIntentId ||
    currency !== params.order.currency.toLowerCase() ||
    amount <= 0 ||
    amount > Number(params.charge.amount || 0) ||
    (params.expectedAmountCents !== undefined &&
      amount !== params.expectedAmountCents)
  ) {
    throw new CommerceRefundError(
      'provider_mismatch',
      'Stripe refund identity, amount, currency, charge, or payment intent did not match this order.',
    );
  }
}

function ensureProviderRefundReadbackMatchesRequest(
  refund: Stripe.Refund,
  params: {
    requestedRefundId: string;
    order: RefundOrder;
    charge: Stripe.Charge;
    paymentIntentId: string;
    expectedAmountCents: number;
  },
) {
  if (refund.id !== params.requestedRefundId) {
    throw new CommerceRefundError(
      'provider_mismatch',
      'Stripe refund readback did not match the requested refund id.',
    );
  }
  ensureProviderRefundMatchesCharge(refund, {
    order: params.order,
    charge: params.charge,
    paymentIntentId: params.paymentIntentId,
    expectedAmountCents: params.expectedAmountCents,
  });
}

async function listAllProviderRefunds(
  stripe: StripeClient,
  chargeId: string,
): Promise<Stripe.Refund[]> {
  if (!('list' in stripe.refunds)) return [];
  const refunds: Stripe.Refund[] = [];
  let startingAfter: string | undefined;
  for (;;) {
    const page = (await stripe.refunds.list({
      charge: chargeId,
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    })) as RefundPage;
    refunds.push(...page.data);
    if (!page.has_more) return refunds;
    const last = page.data[page.data.length - 1];
    if (!last?.id) {
      throw new CommerceRefundError(
        'provider_mismatch',
        'Stripe refund history was paginated but did not include a cursor.',
      );
    }
    startingAfter = last.id;
  }
}

function itemName(order: RefundOrder) {
  return order.kind === 'EVENT'
    ? order.occurrence?.template.name || 'Rhyze special event'
    : order.items.map((item) => item.name).join(', ') || 'Rhyze purchase';
}

function providerRefundKey(refundId: string) {
  return `provider-commerce-refund:${refundId}`;
}

function fullRefundOperationKey(orderId: string) {
  return `commerce-refund-full:${orderId}`;
}

function refundOperationKey(refund: Stripe.Refund) {
  return metadataValue(refund, 'operationKey');
}

function ensureInput(input: CommerceRefundInput) {
  if (input.confirmation.trim() !== 'REFUND') {
    throw new CommerceRefundError(
      'invalid_confirmation',
      'Type REFUND to confirm this cash refund.',
    );
  }
  if (input.reason.trim().length < 5) {
    throw new CommerceRefundError(
      'invalid_reason',
      'A refund reason is required.',
    );
  }
}

function ensureLocalOrderCanBeRefunded(order: RefundOrder) {
  if (!order.stripePaymentIntentId) {
    throw new CommerceRefundError(
      'not_refundable',
      'This commerce order has no Stripe payment intent.',
    );
  }
  if (!['EVENT', 'MERCHANDISE'].includes(order.kind)) {
    throw new CommerceRefundError(
      'not_refundable',
      'Only commerce event and merchandise orders can use this refund flow.',
    );
  }
  if (
    !['PAID', 'FULFILLMENT_REVIEW', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(
      order.status,
    )
  ) {
    throw new CommerceRefundError(
      'not_refundable',
      'This commerce order is not in a paid refundable state.',
    );
  }
  const matchingPayment = order.paymentRecords.find(
    (record) =>
      record.stripePaymentIntentId === order.stripePaymentIntentId &&
      record.commerceOrderId === order.id &&
      record.kind === order.kind &&
      record.amountCents === order.amountCents &&
      record.currency.toLowerCase() === order.currency.toLowerCase() &&
      (order.userId ? record.userId === order.userId : true) &&
      ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(record.status),
  );
  if (!matchingPayment) {
    throw new CommerceRefundError(
      'not_refundable',
      'This order is missing a succeeded local payment record.',
    );
  }
}

async function getOrderForRefund(
  tx: Tx,
  input: CommerceRefundInput,
): Promise<RefundOrder> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.orderId}))`;
  const order = await tx.commerceOrder.findFirst({
    where: {
      id: input.orderId,
      ...(input.memberUserId ? { userId: input.memberUserId } : {}),
    },
    include: {
      user: true,
      items: true,
      occurrence: { include: { template: true } },
      paymentRecords: true,
    },
  });
  if (!order) {
    throw new CommerceRefundError('not_found', 'Commerce order was not found.');
  }
  ensureLocalOrderCanBeRefunded(order);
  return order;
}

async function proveEventBookingForCashRefund(
  tx: Tx,
  order: RefundOrder,
): Promise<RefundBookingProof> {
  if (order.kind !== 'EVENT' || !order.userId || !order.occurrenceId) {
    if (order.kind === 'EVENT') {
      throw new CommerceRefundError(
        'not_refundable',
        'This event order is missing member or occurrence proof and needs manual refund review.',
      );
    }
    return { bookingId: null };
  }

  const relatedOrders = await tx.commerceOrder.findMany({
    where: {
      userId: order.userId,
      occurrenceId: order.occurrenceId,
      kind: 'EVENT',
      stripePaymentIntentId: { not: null },
      status: {
        in: ['PAID', 'FULFILLMENT_REVIEW', 'PARTIALLY_REFUNDED', 'REFUNDED'],
      },
    },
    select: { id: true },
  });
  if (relatedOrders.length !== 1 || relatedOrders[0].id !== order.id) {
    throw new CommerceRefundError(
      'not_refundable',
      'This event booking is linked to ambiguous commerce orders and cannot receive an automatic cash refund.',
    );
  }

  const bookings = await tx.booking.findMany({
    where: {
      occurrenceId: order.occurrenceId,
      userId: order.userId,
    },
    select: { id: true, source: true },
  });

  if (order.status === 'FULFILLMENT_REVIEW' && bookings.length === 0) {
    return { bookingId: null };
  }
  if (bookings.length !== 1 || bookings[0].source !== 'STRIPE_EVENT') {
    throw new CommerceRefundError(
      'not_refundable',
      'This event order does not have exactly one linked Stripe event booking.',
    );
  }

  const bookingId = bookings[0].id;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${bookingId}))`;

  const transfer = await tx.bookingTransfer.findFirst({
    where: { bookingId },
    select: { id: true },
  });
  if (transfer) {
    throw new CommerceRefundError(
      'not_refundable',
      'This event booking has transfer history and needs manual refund review.',
    );
  }

  const bookingLedger = await tx.creditLedgerEntry.findFirst({
    where: {
      OR: [
        { bookingId },
        { sourceReturnKey: eventCancellationCreditKey(bookingId) },
      ],
    },
  });
  if (bookingLedger) {
    throw new CommerceRefundError(
      'not_refundable',
      'This event booking already has credit ledger history and cannot receive a cash refund automatically.',
    );
  }

  return { bookingId };
}

async function prepareRefundOperation(db: Db, input: CommerceRefundInput) {
  const operationKey = fullRefundOperationKey(input.orderId);
  const {
    order,
    bookingId,
    operationAmountCents,
    operationCreated,
    freshPendingWithoutProviderId,
  } = await retrySafeSerializableTransaction(() =>
      db.$transaction(
        async (tx) => {
          const locked = await getOrderForRefund(tx, input);
          const bookingProof = await proveEventBookingForCashRefund(tx, locked);
          // Persist staff-only delivery before contacting Stripe so recovery cannot email later.
          if (input.notifyCustomer === false && !await tx.auditLog.findFirst({
            where: { entityType: 'CommerceOrder', entityId: locked.id, action: 'commerce-refund.notification-suppressed' },
            select: { id: true },
          })) {
            await tx.auditLog.create({ data: {
              actorId: input.actorId,
              action: 'commerce-refund.notification-suppressed',
              entityType: 'CommerceOrder',
              entityId: locked.id,
              after: { operationKey, notificationMode: 'staff_only', reason: input.reason },
            } });
          }
          const intendedAmount = Math.max(
            0,
            locked.amountCents - locked.refundedAmountCents,
          );
          const existing = await tx.commerceRefund.findUnique({
            where: { operationKey },
          });
          if (existing && existing.bookingId !== bookingProof.bookingId) {
            throw new CommerceRefundError(
              'not_refundable',
              'This refund operation no longer matches the proven event booking.',
            );
          }
          if (existing?.status === 'FAILED') {
            throw new CommerceRefundError(
              'provider_failed',
              'The previous Stripe refund attempt failed and needs manual review.',
            );
          }
          const freshPendingWithoutProviderId =
            existing?.status === 'PENDING' &&
            !existing.stripeRefundId &&
            existing.createdAt instanceof Date &&
            Date.now() - existing.createdAt.getTime() < 2 * 60 * 1000;
          if (!existing) {
            await tx.commerceRefund.create({
              data: {
                commerceOrderId: locked.id,
                bookingId: bookingProof.bookingId,
                amountCents: intendedAmount,
                reason: input.reason,
                status: 'PENDING',
                operationKey,
                actorId: input.actorId,
              },
            });
          }
          if (!existing) {
            await tx.auditLog.create({
              data: {
                actorId: input.actorId,
                action: 'commerce-refund.requested',
                entityType: 'CommerceOrder',
                entityId: locked.id,
                before: {
                  status: locked.status,
                  refundedAmountCents: locked.refundedAmountCents,
                },
                after: {
                  reason: input.reason,
                  operationKey,
                  requestedAmountCents: intendedAmount,
                  bookingId: bookingProof.bookingId,
                  memberUserId: input.memberUserId || null,
                },
              },
            });
          }
          return {
            order: locked,
            bookingId: bookingProof.bookingId,
            operationAmountCents: existing?.amountCents ?? intendedAmount,
            operationCreated: !existing,
            freshPendingWithoutProviderId,
          };
        },
        { isolationLevel: 'Serializable' },
      ),
    );
  return {
    order,
    operationKey,
    bookingId,
    operationAmountCents,
    operationCreated,
    freshPendingWithoutProviderId,
  };
}

async function inspectProviderCharge(stripe: StripeClient, order: RefundOrder) {
  let paymentIntent: Stripe.PaymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.retrieve(
      order.stripePaymentIntentId!,
      { expand: ['latest_charge'] },
    );
  } catch (error) {
    throw new CommerceRefundError(
      'stripe_unavailable',
      error instanceof Error
        ? error.message
        : 'Stripe payment intent lookup failed.',
    );
  }
  const chargeId = providerId(paymentIntent.latest_charge);
  if (!chargeId) {
    throw new CommerceRefundError(
      'provider_mismatch',
      'Stripe payment intent has no latest charge.',
    );
  }
  const charge = await stripe.charges.retrieve(chargeId, {
    expand: ['refunds'],
  });
  const chargePaymentIntentId = providerId(charge.payment_intent);
  const paymentIntentOrderId = metadataValue(paymentIntent, 'commerceOrderId');
  const chargeOrderId = metadataValue(charge, 'commerceOrderId');
  const paymentIntentUserId = metadataValue(paymentIntent, 'userId');
  const chargeUserId = metadataValue(charge, 'userId');
  const metadataMatches =
    paymentIntentOrderId === order.id || chargeOrderId === order.id;
  const metadataConflicts =
    (paymentIntentOrderId && paymentIntentOrderId !== order.id) ||
    (chargeOrderId && chargeOrderId !== order.id) ||
    (order.userId &&
      ((paymentIntentUserId && paymentIntentUserId !== order.userId) ||
        (chargeUserId && chargeUserId !== order.userId)));
  if (
    paymentIntent.id !== order.stripePaymentIntentId ||
    paymentIntent.status !== 'succeeded' ||
    Number(paymentIntent.amount || 0) !== order.amountCents ||
    String(paymentIntent.currency || '').toLowerCase() !==
      order.currency.toLowerCase() ||
    chargePaymentIntentId !== order.stripePaymentIntentId ||
    charge.id !== chargeId ||
    charge.status !== 'succeeded' ||
    !charge.paid ||
    charge.captured === false ||
    charge.disputed === true ||
    Number(charge.amount || 0) !== order.amountCents ||
    String(charge.currency || '').toLowerCase() !==
      order.currency.toLowerCase() ||
    !metadataMatches ||
    metadataConflicts
  ) {
    throw new CommerceRefundError(
      'provider_mismatch',
      'Stripe charge identity, amount, currency, status, or metadata did not match this order.',
    );
  }
  const expandedRefunds = Array.isArray(charge.refunds?.data)
    ? charge.refunds.data
    : [];
  const listedRefunds = await listAllProviderRefunds(stripe, charge.id);
  const refundsById = new Map<string, Stripe.Refund>();
  for (const refund of [...expandedRefunds, ...listedRefunds]) {
    ensureProviderRefundMatchesCharge(refund, {
      order,
      charge,
      paymentIntentId: order.stripePaymentIntentId!,
    });
    refundsById.set(refund.id, refund);
  }
  const refunds = [...refundsById.values()];
  const listedSucceededCents = refunds
    .filter(isSucceededRefund)
    .reduce((sum, refund) => sum + refundAmount(refund), 0);
  const listedPendingCents = refunds
    .filter(isPendingRefund)
    .reduce((sum, refund) => sum + refundAmount(refund), 0);
  const chargeRefundedCents = Number(charge.amount_refunded || 0);
  if (chargeRefundedCents !== listedSucceededCents) {
    if (
      listedPendingCents > 0 &&
      chargeRefundedCents <= listedSucceededCents + listedPendingCents
    ) {
      throw new CommerceRefundError(
        'provider_pending',
        'Stripe refund history includes pending refunds for this charge.',
      );
    }
    throw new CommerceRefundError(
      'provider_mismatch',
      'Stripe charge refund totals did not match succeeded refund records.',
    );
  }
  const refundedCents = listedSucceededCents;
  return {
    paymentIntent,
    charge,
    refunds,
    refundedCents,
    remainingCents: Math.max(0, Number(charge.amount || 0) - refundedCents),
  };
}

async function bindProviderVerifiedOperationAmount(
  db: Db,
  input: CommerceRefundInput,
  params: {
    operationKey: string;
    amountCents: number;
    bookingId: string | null;
    operationCreated: boolean;
  },
) {
  return retrySafeSerializableTransaction(() =>
    db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.orderId}))`;
        const operation = await tx.commerceRefund.findUnique({
          where: { operationKey: params.operationKey },
        });
        if (!operation) {
          throw new CommerceRefundError(
            'provider_mismatch',
            'Refund operation proof was not persisted before provider mutation.',
          );
        }
        if (operation.bookingId !== params.bookingId) {
          throw new CommerceRefundError(
            'not_refundable',
            'This refund operation no longer matches the proven event booking.',
          );
        }
        if (operation.stripeRefundId || operation.status !== 'PENDING') {
          return operation.amountCents;
        }
        if (params.operationCreated) {
          await tx.commerceRefund.update({
            where: { id: operation.id },
            data: { amountCents: params.amountCents },
          });
          return params.amountCents;
        }
        if (operation.amountCents !== params.amountCents) {
          throw new CommerceRefundError(
            'provider_mismatch',
            'Stripe refundable balance changed after this refund operation was created.',
          );
        }
        return operation.amountCents;
      },
      { isolationLevel: 'Serializable' },
    ),
  );
}

async function recordProviderAttempt(
  db: Db,
  input: CommerceRefundInput,
  params: {
    operationKey: string;
    refund: Stripe.Refund;
    status: 'PENDING' | 'FAILED';
    failureReason?: string;
  },
) {
  await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.orderId}))`;
      await tx.commerceRefund.upsert({
        where: { operationKey: params.operationKey },
        update: {
          stripeRefundId: params.refund.id,
          amountCents: refundAmount(params.refund),
          status: params.status,
          providerStatus: refundStatus(params.refund),
          failureReason: params.failureReason || null,
        },
        create: {
          commerceOrderId: input.orderId,
          amountCents: refundAmount(params.refund),
          reason: input.reason,
          stripeRefundId: params.refund.id,
          status: params.status,
          providerStatus: refundStatus(params.refund),
          operationKey: params.operationKey,
          actorId: input.actorId,
          failureReason: params.failureReason || null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action:
            params.status === 'PENDING'
              ? 'commerce-refund.provider-pending'
              : 'commerce-refund.provider-failed',
          entityType: 'CommerceOrder',
          entityId: input.orderId,
          after: {
            operationKey: params.operationKey,
            stripeRefundId: params.refund.id,
            providerStatus: params.refund.status || null,
            amountCents: refundAmount(params.refund),
            reason: input.reason,
          },
        },
      });
    },
    { isolationLevel: 'Serializable' },
  );
}

async function upsertSucceededRefund(
  tx: Tx,
  input: CommerceRefundInput,
  params: {
    refund: Stripe.Refund;
    operationKey: string;
    initiatedRefundId: string | null;
    verifiedAt: Date;
    bookingId: string | null;
  },
) {
  const refund = params.refund;
  const existing = await tx.commerceRefund.findUnique({
    where: { stripeRefundId: refund.id },
  });
  const createData = {
    commerceOrderId: input.orderId,
    bookingId: params.bookingId,
    amountCents: refundAmount(refund),
    reason:
      refund.id === params.initiatedRefundId
        ? input.reason
        : 'Provider refund reconciliation',
    stripeRefundId: refund.id,
    status: 'SUCCEEDED',
    providerStatus: refundStatus(refund),
    operationKey:
      refund.id === params.initiatedRefundId
        ? params.operationKey
        : providerRefundKey(refund.id),
    actorId: input.actorId,
    verifiedAt: params.verifiedAt,
    failureReason: null,
  };
  const updateData = {
    commerceOrderId: input.orderId,
    amountCents: refundAmount(refund),
    stripeRefundId: refund.id,
    status: 'SUCCEEDED',
    providerStatus: refundStatus(refund),
    verifiedAt: params.verifiedAt,
    failureReason: null,
  };
  if (existing) {
    await tx.commerceRefund.update({
      where: { id: existing.id },
      data: updateData,
    });
    return;
  }
  if (refund.id === params.initiatedRefundId) {
    const pendingOperation = await tx.commerceRefund.findUnique({
      where: { operationKey: params.operationKey },
    });
    if (pendingOperation) {
      if (pendingOperation.bookingId !== params.bookingId) {
        throw new CommerceRefundError(
          'not_refundable',
          'This refund operation no longer matches the proven event booking.',
        );
      }
      await tx.commerceRefund.update({
        where: { id: pendingOperation.id },
        data: updateData,
      });
      return;
    }
  }
  await tx.commerceRefund.create({ data: createData });
}

async function retireUnmatchedOperationPlaceholder(
  tx: Tx,
  params: {
    operationKey: string;
    bookingId: string | null;
    verifiedAt: Date;
  },
) {
  const pendingOperation = await tx.commerceRefund.findUnique({
    where: { operationKey: params.operationKey },
  });
  if (!pendingOperation) return;
  if (pendingOperation.stripeRefundId || pendingOperation.status !== 'PENDING') {
    return;
  }
  if (pendingOperation.bookingId !== params.bookingId) {
    throw new CommerceRefundError(
      'not_refundable',
      'This refund operation no longer matches the proven event booking.',
    );
  }
  await tx.commerceRefund.update({
    where: { id: pendingOperation.id },
    data: {
      status: 'RECONCILED',
      providerStatus: 'RECONCILED',
      verifiedAt: params.verifiedAt,
      failureReason: 'Retired after provider refund reconciliation.',
    },
  });
}

async function reconcileSucceededRefunds(
  db: Db,
  input: CommerceRefundInput,
  params: {
    operationKey: string;
    chargeAmountCents: number;
    providerRefundedCents: number;
    succeededRefunds: Stripe.Refund[];
    initiatedRefundId: string | null;
    preflightBookingId?: string | null;
  },
): Promise<CommerceRefundResult> {
  return retrySafeSerializableTransaction(() =>
    db.$transaction(
      async (tx) => {
        const order = await getOrderForRefund(tx, input);
        const verifiedAt = new Date();
        const bookingId =
          params.preflightBookingId !== undefined
            ? params.preflightBookingId
            : params.providerRefundedCents >= order.amountCents
              ? (await proveEventBookingForCashRefund(tx, order)).bookingId
              : null;
        for (const refund of params.succeededRefunds) {
          await upsertSucceededRefund(tx, input, {
            refund,
            operationKey: params.operationKey,
            initiatedRefundId: params.initiatedRefundId,
            verifiedAt,
            bookingId,
          });
        }
        if (!params.initiatedRefundId) {
          await retireUnmatchedOperationPlaceholder(tx, {
            operationKey: params.operationKey,
            bookingId,
            verifiedAt,
          });
        }
        const refundedAmountCents = Math.min(
          order.amountCents,
          params.providerRefundedCents,
        );
        const fullyRefunded = refundedAmountCents >= order.amountCents;
        const nextStatus = fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        await tx.commerceOrder.update({
          where: { id: order.id },
          data: { status: nextStatus, refundedAmountCents },
        });
        await tx.paymentRecord.updateMany({
          where: {
            OR: [
              { commerceOrderId: order.id },
              ...(order.stripePaymentIntentId
                ? [{ stripePaymentIntentId: order.stripePaymentIntentId }]
                : []),
            ],
          },
          data: {
            status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
            refundedAmountCents,
          },
        });
        if (
          fullyRefunded &&
          order.kind === 'EVENT' &&
          order.userId &&
          order.occurrenceId &&
          bookingId
        ) {
          await tx.booking.updateMany({
            where: { id: bookingId, status: { not: 'CANCELLED' } },
            data: { status: 'CANCELLED', cancelledAt: verifiedAt },
          });
          await tx.attendanceRecord.deleteMany({
            where: {
              OR: [
                { bookingId },
                {
                  bookingId: null,
                  occurrenceId: order.occurrenceId,
                  userId: order.userId,
                },
              ],
            },
          });
          await tx.emailMessage.updateMany({
            where: {
              dedupeKey: `class-reminder:${bookingId}:${order.occurrenceId}`,
              template: 'CLASS_REMINDER',
              status: { in: ['QUEUED', 'PROCESSING'] },
            },
            data: { status: 'CANCELLED' },
          });
        }
        const auditAction = fullyRefunded
          ? 'commerce-refund.succeeded'
          : 'commerce-refund.partially-reconciled';
        const alreadyAtProviderState =
          order.status === nextStatus &&
          order.refundedAmountCents === refundedAmountCents;
        const existingSuccessAudit = alreadyAtProviderState
          ? await tx.auditLog.findFirst({
              where: {
                action: auditAction,
                entityType: 'CommerceOrder',
                entityId: order.id,
              },
              select: { id: true },
            })
          : null;
        if (!existingSuccessAudit) {
          await tx.auditLog.create({
            data: {
              actorId: input.actorId,
              action: auditAction,
              entityType: 'CommerceOrder',
              entityId: order.id,
              before: {
                status: order.status,
                refundedAmountCents: order.refundedAmountCents,
              },
              after: {
                status: nextStatus,
                refundedAmountCents,
                operationKey: params.operationKey,
                reason: input.reason,
                bookingId,
                stripeRefundIds: params.succeededRefunds.map(
                  (refund) => refund.id,
                ),
              },
            },
          });
        }
        const recipient = order.user?.email || order.customerEmail;
        const notificationSuppressed = await tx.auditLog.findFirst({
          where: { entityType: 'CommerceOrder', entityId: order.id, action: 'commerce-refund.notification-suppressed' },
          select: { id: true },
        });
        if (fullyRefunded && recipient && !notificationSuppressed) {
          await queueEmail(tx, {
            userId: order.userId || undefined,
            to: recipient,
            subject: 'Your Rhyze refund was issued',
            template: 'PAYMENT_REFUND_CONFIRMATION',
            payload: {
              name: order.user?.name || 'Rhyzer',
              itemName: itemName(order),
              amount: refundedAmountCents,
              billingUrl: '/member/billing',
            },
            dedupeKey: `refund-confirmation:commerce:${order.id}:${refundedAmountCents}`,
          });
        }
        return {
          status: fullyRefunded ? 'SUCCEEDED' : 'ALREADY_REFUNDED',
          orderId: order.id,
          amountCents: refundedAmountCents,
          currency: order.currency,
          stripeRefundId: params.initiatedRefundId,
        };
      },
      { isolationLevel: 'Serializable' },
    ),
  );
}

export async function refundCommerceOrderFullRemainder(
  db: Db,
  stripe: StripeClient,
  input: CommerceRefundInput,
): Promise<CommerceRefundResult> {
  ensureInput(input);
  const {
    order,
    operationKey,
    bookingId,
    operationCreated,
    freshPendingWithoutProviderId,
  } = await prepareRefundOperation(db, input);
  const operation = await db.commerceRefund.findUnique({
    where: { operationKey },
  });
  const provider = await inspectProviderCharge(stripe, order);
  if (order.status === 'REFUNDED' && provider.remainingCents > 0) {
    throw new CommerceRefundError(
      'provider_mismatch',
      'The local order says refunded but Stripe still has a refundable balance.',
    );
  }

  if (operation?.stripeRefundId && operation.status !== 'SUCCEEDED') {
    const existingRefund = await stripe.refunds.retrieve(
      operation.stripeRefundId,
    );
    ensureProviderRefundReadbackMatchesRequest(existingRefund, {
      requestedRefundId: operation.stripeRefundId,
      order,
      charge: provider.charge,
      paymentIntentId: order.stripePaymentIntentId!,
      expectedAmountCents: operation.amountCents,
    });
    if (isSucceededRefund(existingRefund)) {
      const otherProviderPending = provider.refunds.find(
        (refund) =>
          refund.id !== existingRefund.id &&
          refund.id !== operation.stripeRefundId &&
          isPendingRefund(refund),
      );
      if (otherProviderPending) {
        throw new CommerceRefundError(
          'provider_pending',
          'A Stripe refund is already pending for this charge.',
        );
      }
      const succeededRefunds = [
        ...provider.refunds.filter(isSucceededRefund),
        existingRefund,
      ].filter(
        (refund, index, all) =>
          all.findIndex((candidate) => candidate.id === refund.id) === index,
      );
      return reconcileSucceededRefunds(db, input, {
        operationKey,
        chargeAmountCents: Number(provider.charge.amount || 0),
        providerRefundedCents: succeededRefunds.reduce(
          (sum, refund) => sum + refundAmount(refund),
          0,
        ),
        succeededRefunds,
        initiatedRefundId: existingRefund.id,
        preflightBookingId: bookingId,
      });
    }
    if (isPendingRefund(existingRefund)) {
      await recordProviderAttempt(db, input, {
        operationKey,
        refund: existingRefund,
        status: 'PENDING',
      });
      throw new CommerceRefundError(
        'provider_pending',
        'Stripe refund is still pending.',
      );
    }
    if (isFailedRefund(existingRefund)) {
      await recordProviderAttempt(db, input, {
        operationKey,
        refund: existingRefund,
        status: 'FAILED',
        failureReason: 'Stripe marked this refund failed or canceled.',
      });
      throw new CommerceRefundError(
        'provider_failed',
        'Stripe marked this refund failed or canceled.',
      );
    }
  }

  const providerPending = provider.refunds.find(isPendingRefund);
  if (providerPending) {
    throw new CommerceRefundError(
      'provider_pending',
      'A Stripe refund is already pending for this charge.',
    );
  }
  const succeededBefore = provider.refunds.filter(isSucceededRefund);
  const recoveredOperationRefund = succeededBefore.find(
    (refund) => refundOperationKey(refund) === operationKey,
  );
  if (recoveredOperationRefund) {
    return reconcileSucceededRefunds(db, input, {
      operationKey,
      chargeAmountCents: Number(provider.charge.amount || 0),
      providerRefundedCents: provider.refundedCents,
      succeededRefunds: succeededBefore,
      initiatedRefundId: recoveredOperationRefund.id,
      preflightBookingId: bookingId,
    });
  }
  if (provider.remainingCents <= 0) {
    return reconcileSucceededRefunds(db, input, {
      operationKey,
      chargeAmountCents: Number(provider.charge.amount || 0),
      providerRefundedCents: provider.refundedCents,
      succeededRefunds: succeededBefore,
      initiatedRefundId: operation?.stripeRefundId || null,
      preflightBookingId: bookingId,
    });
  }
  if (freshPendingWithoutProviderId) {
    throw new CommerceRefundError(
      'provider_pending',
      'A cash refund check is already in progress for this order.',
    );
  }
  const refundAmountCents = await bindProviderVerifiedOperationAmount(
    db,
    input,
    {
      operationKey,
      amountCents: provider.remainingCents,
      bookingId,
      operationCreated,
    },
  );
  if (refundAmountCents !== provider.remainingCents) {
    throw new CommerceRefundError(
      'provider_mismatch',
      'Stripe refundable balance changed after this refund operation was created.',
    );
  }

  const createdRefund = await stripe.refunds.create(
    {
      charge: provider.charge.id,
      amount: refundAmountCents,
      metadata: {
        commerceOrderId: order.id,
        occurrenceId: order.occurrenceId || '',
        userId: order.userId || '',
        operationKey,
      },
    },
    { idempotencyKey: operationKey },
  );
  const readback = await stripe.refunds.retrieve(createdRefund.id);
  ensureProviderRefundReadbackMatchesRequest(readback, {
    requestedRefundId: createdRefund.id,
    order,
    charge: provider.charge,
    paymentIntentId: order.stripePaymentIntentId!,
    expectedAmountCents: refundAmountCents,
  });
  if (isPendingRefund(readback)) {
    await recordProviderAttempt(db, input, {
      operationKey,
      refund: readback,
      status: 'PENDING',
    });
    throw new CommerceRefundError(
      'provider_pending',
      'Stripe refund is pending; Rhyze did not mark this order refunded.',
    );
  }
  if (!isSucceededRefund(readback)) {
    await recordProviderAttempt(db, input, {
      operationKey,
      refund: readback,
      status: 'FAILED',
      failureReason: 'Stripe did not return a succeeded refund on readback.',
    });
    throw new CommerceRefundError(
      'provider_failed',
      'Stripe did not confirm a succeeded refund.',
    );
  }
  const succeededRefunds = [...succeededBefore, readback].filter(
    (refund, index, all) =>
      all.findIndex((candidate) => candidate.id === refund.id) === index,
  );
  return reconcileSucceededRefunds(db, input, {
    operationKey,
    chargeAmountCents: Number(provider.charge.amount || 0),
    providerRefundedCents: provider.refundedCents + refundAmount(readback),
    succeededRefunds,
    initiatedRefundId: readback.id,
    preflightBookingId: bookingId,
  });
}
