import { assertFinancialRelease, assertFinancialSubmission } from '@/lib/payments/financial-release';
import { assertUnrefundedAttendanceReceipt, financialLock, requestFinancialReview } from './refund-review';
import { resolveTrialAttendancePaymentSource, type TrialPaymentSource } from '@/lib/payments/trial-attendance-card';
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
  resolveTrialPaymentSource?(input: { bookingId: string; userId: string }): Promise<TrialPaymentSource>;
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
      reason: 'NO_SAVED_PAYMENT_METHOD' | 'PAYMENT_FAILED' | 'INELIGIBLE_ACCESS';
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
  let paymentMethodId: string | null = null;
  try {
    const trial = await gateway.resolveTrialPaymentSource?.(input);
    if (input.feeType !== 'TRANSFER' && !trial?.isTrial) {
      // Defense in depth: stale callers cannot charge non-trial attendance fees.
      return { status: 'FAILED', paymentIntentId: null, reason: 'INELIGIBLE_ACCESS' };
    }
    if (trial?.isTrial) {
      // Missing/unusable original trial card fails closed, never falls back to another card.
      paymentMethodId = trial.paymentMethodId ?? null;
      input = { ...input, stripeCustomerId: trial.customerId ?? null };
    } else if (input.stripeCustomerId) {
      const customer = await gateway.retrieveCustomer(input.stripeCustomerId);
      if (!customer.deleted) {
        paymentMethodId = customer.defaultPaymentMethodId;
        if (!paymentMethodId) {
          paymentMethodId = (await gateway.listAttachedCardPaymentMethodIds(input.stripeCustomerId))[0] ?? null;
        }
      }
    }
  } catch {
    await gateway.recordAttempt(failedRecord(input));
    return { status: 'FAILED', paymentIntentId: null, reason: 'PAYMENT_FAILED' };
  }

  if (!paymentMethodId || !input.stripeCustomerId) {
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
  resolveTrialPaymentSource: resolveTrialAttendancePaymentSource,
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
      { idempotencyKey: request.idempotencyKey, maxNetworkRetries: 0, timeout: 20000 },
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

export async function chargeAttendanceFee(input: AttendanceFeeInput): Promise<AttendanceFeeResult> {
  const booking = await prisma.booking.findUnique({ where: { id: input.bookingId }, select: { occurrenceId: true } });
  if (booking && ['cmvv9bp4g0001gt09ewtk8n57', 'cmw026ajl0001jn09jsqpqzij'].includes(booking.occurrenceId)) return { status: 'FAILED', paymentIntentId: null, reason: 'INELIGIBLE_ACCESS' } as const;
  await assertFinancialRelease(prisma);
  const owned = await prisma.$transaction(async tx => {
    await financialLock(tx, input.bookingId, input.idempotencyKey);
    const open = await tx.$queryRaw<{id:string}[]>`SELECT id FROM "FinancialReview" WHERE "bookingId"=${input.bookingId} AND "resolvedAt" IS NULL`;
    const replacement = await tx.$queryRaw<{id:string}[]>`SELECT o.id FROM "ApprovedFinancialOperation" o JOIN "PaymentRecord" p ON p.id=o."paymentRecordId" WHERE p."bookingId"=${input.bookingId} AND o.kind='REPLACEMENT'`;
    if (open.length || replacement.length) throw Error('Financial review blocks collection for this booking');
    const prior = await tx.$queryRaw<{operationKey:string;state:string;paymentIntentId:string|null}[]>`SELECT * FROM "AttendanceCollection" WHERE "bookingId"=${input.bookingId}`;
    if (prior[0]) {
      if (prior[0].operationKey === input.idempotencyKey && prior[0].state === 'SUCCEEDED' && prior[0].paymentIntentId) {
        await assertUnrefundedAttendanceReceipt(tx, input.bookingId, prior[0].paymentIntentId);
        return prior[0].paymentIntentId;
      }
      throw Error('Existing collection ownership requires review; no automatic retry');
    }
    const history = await tx.paymentRecord.count({where:{bookingId:input.bookingId,kind:{in:['NO_SHOW_FEE','LATE_CANCELLATION_FEE','TRANSFER_FEE']},status:{not:'FAILED'}}});
    if(history) throw Error('Existing historical fee requires reviewed financial ownership');
    await tx.$executeRaw`INSERT INTO "AttendanceCollection" ("bookingId","operationKey",state) VALUES (${input.bookingId},${input.idempotencyKey},'UNKNOWN')`;
    return null;
  });
  if (owned) return {status:'SUCCEEDED',paymentIntentId:owned};
  const result = await prisma.$transaction(async tx => {
    const deadline=Date.now()+60000;
    await financialLock(tx,input.bookingId,input.idempotencyKey);
    const open = await tx.$queryRaw<{id:string}[]>`SELECT id FROM "FinancialReview" WHERE "bookingId"=${input.bookingId} AND "resolvedAt" IS NULL`;
    if(open.length) throw Error('Financial review blocks collection');
    await assertFinancialRelease(tx);
    const result = await chargeAttendanceFeeWithGateway(input, {...productionGateway,createPaymentIntent:async request=>{await assertFinancialSubmission(tx,deadline);return productionGateway.createPaymentIntent(request);}});
    if (result.status === 'SUCCEEDED') await tx.$executeRaw`UPDATE "AttendanceCollection" SET state='SUCCEEDED',"paymentIntentId"=${result.paymentIntentId} WHERE "bookingId"=${input.bookingId} AND "operationKey"=${input.idempotencyKey}`;
    return result;
  }, {timeout:60000});
  // Failure includes an uncertain provider outcome: retain ownership permanently.
  return result;

}

export type AttendanceFeeRefundGateway = {
  requestReview(input: {paymentIntentId:string;amountCents:number;idempotencyKey:string}):Promise<void>;
};
export async function refundAttendanceFeeWithGateway(
  input: {paymentIntentId:string;amountCents:number;idempotencyKey:string},
  gateway:AttendanceFeeRefundGateway,
) { await gateway.requestReview(input); }

/** Detection only. Financial execution requires an exact approved-owner operation. */
export async function refundAttendanceFee(input: {
  paymentIntentId: string; amountCents: number; idempotencyKey: string;
}) {
  await prisma.$transaction(tx => requestFinancialReview(tx, {
    paymentIntentId: input.paymentIntentId,
    basisKind: 'FAILED_SERVICE',
    reason: `Urgent failed-service/possible duplicate review: ${input.idempotencyKey}`,
  }));
}
