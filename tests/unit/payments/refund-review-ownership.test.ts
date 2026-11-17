vi.mock('@/lib/payments/financial-release',()=>({assertFinancialSubmission:vi.fn(async()=>{}),assertFinancialRelease:vi.fn()}));
import { describe, expect, it, vi } from 'vitest';
const env = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/db/prisma', () => ({
  get prisma() {
    return env.db;
  },
}));
vi.mock('@/lib/payments/stripe', () => ({
  getStripe: () => {
    throw Error('Provider must not be called');
  },
}));
import {
  confirmAttendanceService,
  requestFinancialReview,
  approveFinancialOperation,
} from '@/lib/payments/refund-review';
import { chargeAttendanceFee } from '@/lib/payments/attendance-fee';
function fixture() {
  const payment = {
    id: 'p',
    bookingId: 'b',
    userId: 'u',
    kind: 'NO_SHOW_FEE',
    status: 'SUCCEEDED',
    amountCents: 1000,
    refundedAmountCents: 0,
    stripePaymentIntentId: 'intent',
    stripeEventId: 'event',
  };
  const booking = {
    id: 'b',
    userId: 'u',
    occurrenceId: 'o',
    status: 'ATTENDED',
    updatedAt: new Date(0),
    attendance: { id: 'a', status: 'CHECKED_IN', updatedAt: new Date(0) },
    policySnapshot: {},
  };
  const collection = {
    bookingId: 'b',
    operationKey: 'key',
    state: 'SUCCEEDED',
    paymentIntentId: 'intent',
    serviceConfirmed: false,
  };
  const operations: any[] = [];
  const reviews: any[] = [];
  const tx: any = {
    auditLog: { create: async () => ({}) },
    user: {
      findUnique: async () => ({
        email: 'melissa@rhyzefit.com',
        role: 'OWNER',
        status: 'ACTIVE',
      }),
    },
    paymentRecord: {
      findUnique: async () => payment,
      findUniqueOrThrow: async () => payment,
    },
    booking: { findUnique: async () => booking, findUniqueOrThrow: async () => booking },
    bookingTransfer: { count: async () => 0 },
    $executeRaw: vi.fn(async (sql: TemplateStringsArray, ...values: any[]) => {
      if (sql.join('').includes('INSERT INTO "FinancialReview"'))
        reviews.push({
          id: values[0],
          paymentRecordId: 'p',
          version: 1,
          resolvedAt: null,
          reason: 'correction',
          basis: values[5] ? JSON.parse(values[5]) : null,
        });
      return 1;
    }),
    $queryRaw: vi.fn(async (sql: TemplateStringsArray, ...values: any[]) => {
      const text = sql.join('');
      if (text.includes('INSERT INTO "ApprovedFinancialOperation"')) {
        const operation = {
          id: values[0],
          paymentRecordId: values[1],
          reviewId: values[2],
          kind: values[3],
          actorId: values[4],
          amountCents: values[7],
          currency: values[8],
          payload: JSON.parse(values[9]),
          providerKey: values[11],
          state: 'UNKNOWN',
          providerId: null,
        };
        operations.push(operation);
        return [operation];
      }
      if (text.includes('"AttendanceCollection"')) return [collection];
      if (text.includes('"ApprovedFinancialOperation"')) return operations;
      if (text.includes('"FinancialReview"')) return reviews;
      return [];
    }),
    $transaction: async (fn: any) => fn(tx),
  };
  env.db = tx;
  return { tx, payment, booking, collection, operations, reviews };
}
describe('financial service ownership', () => {
  it.each(['REFUNDED', 'PARTIAL_REFUND', 'MISSING', 'RESERVED'])(
    'rejects service when the fee is %s',
    async (state) => {
      const f = fixture();
      if (state === 'REFUNDED') f.payment.status = 'REFUNDED';
      if (state === 'PARTIAL_REFUND') f.payment.refundedAmountCents = 500;
      if (state === 'MISSING') f.tx.paymentRecord.findUnique = async () => null;
      if (state === 'RESERVED')
        f.operations.push({ id: 'refund', kind: 'REFUND', state: 'UNKNOWN' });
      await expect(
        confirmAttendanceService(f.tx, 'b', 'intent'),
      ).rejects.toThrow();
      expect(
        f.tx.$executeRaw.mock.calls.some(([sql]: any) =>
          sql.join('').includes('SET "serviceConfirmed"=true'),
        ),
      ).toBe(false);
    },
  );
  it('takes financial ownership before confirming service', async () => {
    const f = fixture();
    await confirmAttendanceService(f.tx, 'b', 'intent');
    expect(f.tx.$executeRaw.mock.calls[0][0].join('')).toContain(
      'pg_advisory_xact_lock',
    );
  });
  it.each(['REFUNDED', 'PARTIAL_REFUND'])(
    'does not reuse a %s collection receipt',
    async (state) => {
      const f = fixture();
      if (state === 'REFUNDED') f.payment.status = 'REFUNDED';
      else f.payment.refundedAmountCents = 500;
      await expect(
        chargeAttendanceFee({
          bookingId: 'b',
          userId: 'u',
          stripeCustomerId: 'customer',
          feeType: 'NO_SHOW',
          amountCents: 1000,
          idempotencyKey: 'key',
        }),
      ).rejects.toThrow(/receipt|refunded/i);
    },
  );
  it('rejects stale correction review before reserving or submitting', async () => {
    const f = fixture();
    await requestFinancialReview(f.tx, {
      paymentIntentId: 'intent',
      reason: 'Attendance correction',
      basisKind: 'ATTENDANCE_CORRECTION',
    });
    f.booking.attendance.status = 'NO_SHOW';
    f.booking.updatedAt = new Date(1000);
    const provider: any = { inspect: vi.fn(), submit: vi.fn() };
    await expect(
      approveFinancialOperation(f.tx, provider, {
        actorId: 'owner',
        paymentRecordId: 'p',
        kind: 'REFUND',
        reason: 'Exact correction approval',
        reviewId: f.reviews[0].id,
        reviewVersion: 1,
        expectedAmountCents: 1000,
      }),
    ).rejects.toThrow(/stale|changed/i);
    expect(provider.inspect).not.toHaveBeenCalled();
    expect(provider.submit).not.toHaveBeenCalled();
  });
  it('rejects failed-service refund review after a service winner', async () => {
    const f = fixture();
    await requestFinancialReview(f.tx, {
      paymentIntentId: 'intent',
      reason: 'Failed service',
      basisKind: 'FAILED_SERVICE',
    });
    f.collection.serviceConfirmed = true;
    const provider: any = { inspect: vi.fn(), submit: vi.fn() };
    await expect(
      approveFinancialOperation(f.tx, provider, {
        actorId: 'owner',
        paymentRecordId: 'p',
        kind: 'REFUND',
        reason: 'Exact failed-service approval',
        reviewId: f.reviews[0].id,
        reviewVersion: 1,
        expectedAmountCents: 1000,
      }),
    ).rejects.toThrow(/stale|changed|service/i);
    expect(provider.submit).not.toHaveBeenCalled();
  });
});

it('rechecks the review basis after reservation, immediately before submission', async () => {
  const f = fixture();
  await requestFinancialReview(f.tx, {
    paymentIntentId: 'intent',
    reason: 'Attendance correction',
    basisKind: 'ATTENDANCE_CORRECTION',
  });
  let commits = 0;
  f.tx.$transaction = async (fn: any) => {
    const result = await fn(f.tx);
    if (++commits === 1) {
      f.booking.attendance.status = 'NO_SHOW';
      f.booking.updatedAt = new Date(1000);
    }
    return result;
  };
  const provider: any = {
    inspect: vi.fn(async () => ({
      paymentIntentId: 'intent',
      bookingId: 'b',
      amountCents: 1000,
      currency: 'usd',
      evidence: 'constant provider double',
    })),
    submit: vi.fn(),
    receipt: vi.fn(),
  };
  const operation = await approveFinancialOperation(f.tx, provider, {
    actorId: 'owner',
    paymentRecordId: 'p',
    kind: 'REFUND',
    reason: 'Exact correction approval',
    reviewId: f.reviews[0].id,
    reviewVersion: 1,
    expectedAmountCents: 1000,
  });
  expect(operation.state).toBe('UNKNOWN');
  expect(provider.submit).not.toHaveBeenCalled();
  expect(provider.inspect).toHaveBeenCalledTimes(1);
});
it.each(['confirmed', 'completed-transfer', 'missing-basis'])(
  'rejects a newly opened failed-service review with %s ownership',
  async (state) => {
    const f = fixture();
    if (state === 'confirmed') f.collection.serviceConfirmed = true;
    if (state === 'completed-transfer')
      f.tx.bookingTransfer.count = async () => 1;
    await requestFinancialReview(f.tx, {
      paymentIntentId: 'intent',
      reason: 'Failed service',
      basisKind: 'FAILED_SERVICE',
    });
    if (state === 'missing-basis') f.reviews[0].basis = null;
    const provider: any = { inspect: vi.fn(), submit: vi.fn() };
    await expect(
      approveFinancialOperation(f.tx, provider, {
        actorId: 'owner',
        paymentRecordId: 'p',
        kind: 'REFUND',
        reason: 'Exact failed-service approval',
        reviewId: f.reviews[0].id,
        reviewVersion: 1,
        expectedAmountCents: 1000,
      }),
    ).rejects.toThrow(/stale|service/i);
    expect(provider.inspect).not.toHaveBeenCalled();
    expect(provider.submit).not.toHaveBeenCalled();
  },
);
