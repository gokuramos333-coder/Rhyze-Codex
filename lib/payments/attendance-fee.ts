import type { PaymentRecordKind, PaymentRecordStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';

export type AttendanceFeeType =
  | 'TRANSFER'
  | 'LATE_CANCELLATION'
  | 'NO_SHOW';

export type AttendanceFeePaymentRequest = {
  amount: number;
  currency: 'usd';
  customer: string;
  paymentMethod: string;
  confirm: true;
  offSession: true;
  description: string;
  metadata: {
    bookingId: string;
    memberId: string;
    feeType: AttendanceFeeType;
    amountCents: string;
  };
  idempotencyKey: string;
};

export type AttendanceFeeRecord = {
  userId: string;
  bookingId: string;
  kind: PaymentRecordKind;
  status: PaymentRecordStatus;
  amountCents: number;
  stripeEventId: string;
  stripeCustomerId: string | null;
  stripePaymentIntentId: string | null;
};

export type AttendanceFeeGateway = {
  retrieveCustomer(customerId: string): Promise<{
    deleted: boolean;
    defaultPaymentMethodId: string | null;
  }>;
  listAttachedCardPaymentMethodIds(customerId: string): Promise<string[]>;
  createPaymentIntent(request: AttendanceFeePaymentRequest): Promise<{
    id: string;
    status: string;
  }>;
  recordAttempt(record: AttendanceFeeRecord): Promise<void>;
};

export type AttendanceFeeInput = {
  bookingId: string;
  userId: string;
  stripeCustomerId: string | null;
  feeType: AttendanceFeeType;
  amountCents: number;
  idempotencyKey: string;
};

export type AttendanceFeeResult =
  | { status: 'SUCCEEDED'; paymentIntentId: string }
  | {
      status: 'FAILED';
      paymentIntentId: null;
      reason: 'NO_SAVED_PAYMENT_METHOD' | 'PAYMENT_FAILED';
    };

function recordKind(feeType: AttendanceFeeType): PaymentRecordKind {
  if (feeType === 'TRANSFER') return 'TRANSFER_FEE';
  if (feeType === 'NO_SHOW') return 'NO_SHOW_FEE';
  return 'LATE_CANCELLATION_FEE';
}

function description(feeType: AttendanceFeeType) {
  if (feeType === 'TRANSFER') return 'Rhyze class transfer fee';
  if (feeType === 'NO_SHOW') return 'Rhyze no-show fee';
  return 'Rhyze late-cancellation fee';
}

function failedRecord(input: AttendanceFeeInput): AttendanceFeeRecord {
  return {
    userId: input.userId,
    bookingId: input.bookingId,
    kind: recordKind(input.feeType),
    status: 'FAILED',
    amountCents: input.amountCents,
    stripeEventId: `attendance-fee-failed:${input.feeType}:${input.idempotencyKey}`,
    stripeCustomerId: input.stripeCustomerId,
    stripePaymentIntentId: null,
  };
}

export async function chargeAttendanceFeeWithGateway(
  input: AttendanceFeeInput,
  gateway: AttendanceFeeGateway,
): Promise<AttendanceFeeResult> {
  if (!input.stripeCustomerId) {
    await gateway.recordAttempt(failedRecord(input));
    return {
      status: 'FAILED',
      paymentIntentId: null,
      reason: 'NO_SAVED_PAYMENT_METHOD',
    };
  }

  let paymentMethodId: string | null = null;
  try {
    const customer = await gateway.retrieveCustomer(input.stripeCustomerId);
    if (!customer.deleted) {
      paymentMethodId = customer.defaultPaymentMethodId;
      if (!paymentMethodId) {
        paymentMethodId = (
          await gateway.listAttachedCardPaymentMethodIds(input.stripeCustomerId)
        )[0] ?? null;
      }
    }
  } catch {
    await gateway.recordAttempt(failedRecord(input));
    return { status: 'FAILED', paymentIntentId: null, reason: 'PAYMENT_FAILED' };
  }

  if (!paymentMethodId) {
    await gateway.recordAttempt(failedRecord(input));
    return {
      status: 'FAILED',
      paymentIntentId: null,
      reason: 'NO_SAVED_PAYMENT_METHOD',
    };
  }

  try {
    const payment = await gateway.createPaymentIntent({
      amount: input.amountCents,
      currency: 'usd',
      customer: input.stripeCustomerId,
      paymentMethod: paymentMethodId,
      confirm: true,
      offSession: true,
      description: description(input.feeType),
      metadata: {
        bookingId: input.bookingId,
        memberId: input.userId,
        feeType: input.feeType,
        amountCents: String(input.amountCents),
      },
      idempotencyKey: input.idempotencyKey,
    });
    if (payment.status !== 'succeeded') {
      await gateway.recordAttempt(failedRecord(input));
      return { status: 'FAILED', paymentIntentId: null, reason: 'PAYMENT_FAILED' };
    }
    await gateway.recordAttempt({
      userId: input.userId,
      bookingId: input.bookingId,
      kind: recordKind(input.feeType),
      status: 'SUCCEEDED',
      amountCents: input.amountCents,
      stripeEventId: `attendance-fee:${payment.id}`,
      stripeCustomerId: input.stripeCustomerId,
      stripePaymentIntentId: payment.id,
    });
    return { status: 'SUCCEEDED', paymentIntentId: payment.id };
  } catch {
    await gateway.recordAttempt(failedRecord(input));
    return { status: 'FAILED', paymentIntentId: null, reason: 'PAYMENT_FAILED' };
  }
}

const productionGateway: AttendanceFeeGateway = {
  async retrieveCustomer(customerId) {
    if (!stripeIsConfigured()) {
      return { deleted: true, defaultPaymentMethodId: null };
    }
    const customer = await getStripe().customers.retrieve(customerId);
    if (customer.deleted) return { deleted: true, defaultPaymentMethodId: null };
    const defaultPaymentMethod = customer.invoice_settings.default_payment_method;
    return {
      deleted: false,
      defaultPaymentMethodId: typeof defaultPaymentMethod === 'string'
        ? defaultPaymentMethod
        : defaultPaymentMethod?.id ?? null,
    };
  },
  async listAttachedCardPaymentMethodIds(customerId) {
    if (!stripeIsConfigured()) return [];
    const methods = await getStripe().paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 10,
    });
    return methods.data.map((item) => item.id);
  },
  async createPaymentIntent(request) {
    const payment = await getStripe().paymentIntents.create(
      {
        amount: request.amount,
        currency: request.currency,
        customer: request.customer,
        payment_method: request.paymentMethod,
        confirm: request.confirm,
        off_session: request.offSession,
        description: request.description,
        metadata: request.metadata,
      },
      { idempotencyKey: request.idempotencyKey },
    );
    return { id: payment.id, status: payment.status };
  },
  async recordAttempt(record) {
    await prisma.paymentRecord.upsert({
      where: { stripeEventId: record.stripeEventId },
      update: record.status === 'FAILED'
        ? {
            bookingId: record.bookingId,
            status: record.status,
            stripePaymentIntentId: record.stripePaymentIntentId,
          }
        : { bookingId: record.bookingId },
      create: {
        ...record,
        occurredAt: new Date(),
      },
    });
  },
};

export function chargeAttendanceFee(input: AttendanceFeeInput) {
  return chargeAttendanceFeeWithGateway(input, productionGateway);
}

export type AttendanceFeeRefundGateway = {
  refundPaymentIntent(input: {
    paymentIntentId: string;
    idempotencyKey: string;
  }): Promise<void>;
  markPaymentRefunded(input: {
    paymentIntentId: string;
    amountCents: number;
  }): Promise<void>;
};

export async function refundAttendanceFeeWithGateway(
  input: {
    paymentIntentId: string;
    amountCents: number;
    idempotencyKey: string;
  },
  gateway: AttendanceFeeRefundGateway,
) {
  await gateway.refundPaymentIntent({
    paymentIntentId: input.paymentIntentId,
    idempotencyKey: input.idempotencyKey,
  });
  await gateway.markPaymentRefunded({
    paymentIntentId: input.paymentIntentId,
    amountCents: input.amountCents,
  });
}

const productionRefundGateway: AttendanceFeeRefundGateway = {
  async refundPaymentIntent(input) {
    await getStripe().refunds.create(
      { payment_intent: input.paymentIntentId },
      { idempotencyKey: input.idempotencyKey },
    );
  },
  async markPaymentRefunded(input) {
    await prisma.paymentRecord.update({
      where: { stripePaymentIntentId: input.paymentIntentId },
      data: {
        status: 'REFUNDED',
        refundedAmountCents: input.amountCents,
      },
    });
  },
};

export function refundAttendanceFee(input: {
  paymentIntentId: string;
  amountCents: number;
  idempotencyKey: string;
}) {
  return refundAttendanceFeeWithGateway(input, productionRefundGateway);
}
