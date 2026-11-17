import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  approveFinancialOperation,
  adjudicateFinancialReview,
  confirmAttendanceService,
  financialLock,
  reconcileFinancialOperation,
  requestFinancialReview,
  type FinancialOperation,
  type FinancialProvider,
  type ReviewRow,
} from '@/lib/payments/refund-review';
import type { BoundReceipt } from '@/lib/payments/refund-review-policy';
import { financialQueuePage } from '@/lib/payments/refund-review-queue';
import { maintainFinancialReviewTasks } from '@/lib/payments/refund-review-tasks';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { refundTestDatabase } from '@/scripts/release/refund-test-database';
// Real action/database/collection code; only authentication, navigation and provider boundary are doubled.
const actionHooks = vi.hoisted(() => ({
  db: null as any,
  actor: null as any,
  afterCharge: null as null | (() => Promise<void>),
  afterBookingLock: null as null | ((key: unknown) => Promise<void>),
}));
vi.mock('@/lib/db/prisma', () => ({
  get prisma() {
    return actionHooks.db;
  },
}));
vi.mock('@/lib/auth/session', () => ({
  requireActiveUser: async () => actionHooks.actor,
  requireArea: async () => actionHooks.actor,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Error(url);
  },
}));
vi.mock('@/lib/payments/stripe', () => ({
  stripeIsConfigured: () => false,
  getStripe: () => {
    throw Error('Native regressions must never call a provider');
  },
}));
vi.mock('@/lib/payments/attendance-fee', async (original) => {
  const actual =
    await original<typeof import('@/lib/payments/attendance-fee')>();
  return {
    ...actual,
    chargeAttendanceFee: async (
      ...args: Parameters<typeof actual.chargeAttendanceFee>
    ) => {
      const result = await actual.chargeAttendanceFee(...args);
      await actionHooks.afterCharge?.();
      return result;
    },
  };
});
import { markAttendanceAction } from '@/app/(portal)/instructor/classes/[occurrenceId]/roster/actions';
import { rescheduleMemberBookingAction } from '@/app/(portal)/member/bookings/reschedule/actions';
import { transferBookingAction } from '@/app/(portal)/instructor/classes/[occurrenceId]/transfers/actions';
import { cancelBookingAction } from '@/app/(portal)/member/bookings/actions';
import { chargeAttendanceFee } from '@/lib/payments/attendance-fee';
const config = refundTestDatabase(process.env);
const url = config.url,
  dir = config.identity.dir,
  socket = config.socket;
if (realpathSync(dir) !== `${realpathSync(socket)}/data`)
  throw Error('Canonical owned directory mismatch');
const db = new PrismaClient({ datasourceUrl: url });
let owner: string, other: string;
beforeAll(async () => {
  const [identity] = await db.$queryRaw<
    {
      database: string;
      directory: string;
      port: string;
      username: string;
      address: string | null;
    }[]
  >`SELECT current_database() AS database,current_setting('data_directory') AS directory,current_setting('port') AS port,current_user AS username,inet_server_addr()::text AS address`;
  expect(identity).toEqual({
    database: 'refund_review_test',
    directory: dir,
    port: String(config.identity.port),
    username: 'refund_test',
    address: null,
  });
  owner = (
    await db.user.create({
      data: { email: 'melissa@rhyzefit.com', role: 'OWNER', status: 'ACTIVE' },
    })
  ).id;
  other = (
    await db.user.create({
      data: {
        email: 'synthetic@example.test',
        role: 'MEMBER',
        status: 'ACTIVE',
      },
    })
  ).id;
});
afterAll(() => db.$disconnect());
async function fixture() {
  const member = await db.user.create({
    data: {
      email: `${randomUUID()}@example.test`,
      role: 'MEMBER',
      status: 'ACTIVE',
    },
  });
  const category = await db.classCategory.create({
    data: { name: 'Synthetic', slug: randomUUID() },
  });
  const template = await db.classTemplate.create({
    data: {
      name: 'Synthetic financial class',
      slug: randomUUID(),
      description: 'Synthetic',
      durationMinutes: 60,
      defaultCapacity: 10,
      categoryId: category.id,
      tags: [],
      equipment: [],
    },
  });
  const occurrence = await db.classOccurrence.create({
    data: {
      templateId: template.id,
      startAt: new Date(),
      endAt: new Date(Date.now() + 3600000),
      capacity: 10,
    },
  });
  const booking = await db.booking.create({
    data: { userId: member.id, occurrenceId: occurrence.id },
  });
  const payment = await db.paymentRecord.create({
    data: {
      userId: member.id,
      bookingId: booking.id,
      kind: 'NO_SHOW_FEE',
      status: 'SUCCEEDED',
      amountCents: 1000,
      stripeEventId: randomUUID(),
      stripePaymentIntentId: randomUUID(),
      stripeCustomerId: 'synthetic-customer',
    },
  });
  await db.$transaction((tx) =>
    requestFinancialReview(tx, {
      paymentIntentId: payment.stripePaymentIntentId!,
      reason: 'Synthetic failed service obligation',
    }),
  );
  const [review] = await db.$queryRaw<
    ReviewRow[]
  >`SELECT * FROM "FinancialReview" WHERE "paymentRecordId"=${payment.id}`;
  let result: BoundReceipt | null = null;
  const provider: FinancialProvider = {
    inspect: async () => ({
      paymentIntentId: payment.stripePaymentIntentId!,
      chargeId: 'synthetic-charge',
      customerId: 'synthetic-customer',
      cardId: 'synthetic-card',
      accountId: 'synthetic-account',
      livemode: false,
      bookingId: booking.id,
      userId: member.id,
      amountCents: 1000,
      currency: 'usd',
      originalAmountCents: 1000,
      refundedBeforeCents: 0,
      evidence: 'synthetic-proof',
    }),
    submit: vi.fn(async (op) => {
      result = {
        id: randomUUID(),
        operationId: op.id,
        paymentIntentId:
          op.kind === 'REPLACEMENT'
            ? 'replacement-' + op.id
            : op.payload.paymentIntentId,
        chargeId:
          op.kind === 'REPLACEMENT'
            ? 'replacement-charge-' + op.id
            : op.payload.chargeId,
        amountCents: 1000,
        currency: 'usd',
        status: 'succeeded',
      };
      return result.id;
    }),
    receipt: async () => result,
  };
  const input = {
    actorId: owner,
    paymentRecordId: payment.id,
    kind: 'REFUND' as const,
    reason: 'Approve this exact synthetic case',
    reviewId: review.id,
    reviewVersion: 1,
    expectedAmountCents: 1000,
  };
  return {
    payment,
    booking,
    provider,
    input,
    setReceipt: (r: BoundReceipt | null) => {
      result = r;
    },
    getReceipt: () => result,
  };
}
async function waitForLock() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`;
    if (Number(rows[0].n) > 0) {
      console.log('Observed actual PostgreSQL lock waiter');
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error('No actual PostgreSQL waiter observed');
}
describe('durable owner financial operations on native PostgreSQL', () => {
  it('rejects an unapproved actor without a provider call', async () => {
    const f = await fixture();
    await expect(
      approveFinancialOperation(db, f.provider, { ...f.input, actorId: other }),
    ).rejects.toThrow('Vanessa or Melissa');
    expect(f.provider.submit).not.toHaveBeenCalled();
  });
  it('serializes two approvals behind an actual lock waiter and submits once', async () => {
    const f = await fixture();
    let release!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((r) => (locked = r)),
      gate = new Promise<void>((r) => (release = r));
    const held = db.$transaction(
      async (tx) => {
        await financialLock(tx, f.booking.id, f.payment.stripePaymentIntentId!);
        locked();
        await gate;
      },
      { timeout: 15000 },
    );
    await ready;
    const first = approveFinancialOperation(db, f.provider, f.input);
    const second = approveFinancialOperation(db, f.provider, f.input);
    try {
      await waitForLock();
    } finally {
      release();
    }
    await held;
    const ops = await Promise.all([first, second]);
    expect(ops[0].id).toBe(ops[1].id);
    expect(f.provider.submit).toHaveBeenCalledTimes(1);
    expect(
      (
        await db.paymentRecord.findUniqueOrThrow({
          where: { id: f.payment.id },
        })
      ).refundedAmountCents,
    ).toBe(1000);
  });
  it('retains timeout ownership across repeats and reconciles lost provider acknowledgment', async () => {
    const f = await fixture();
    const submit = f.provider.submit;
    f.provider.submit = vi.fn(async (op, beforeSubmission) => {
      await submit(op,beforeSubmission);
      throw Error('Lost acknowledgment');
    });
    const op = await approveFinancialOperation(db, f.provider, f.input);
    expect(op.state).toBe('UNKNOWN');
    const reconciled = await approveFinancialOperation(db, f.provider, f.input);
    expect(reconciled.state).toBe('SUCCEEDED');
    expect(f.provider.submit).toHaveBeenCalledTimes(1);
  });
  it.each(['pending', 'failed'])(
    'keeps %s receipt as an unresolved urgent obligation',
    async (status) => {
      const f = await fixture();
      const submit = f.provider.submit;
      f.provider.submit = vi.fn(async (op, beforeSubmission) => {
        const id = await submit(op,beforeSubmission);
        f.setReceipt({ ...f.getReceipt()!, status });
        return id;
      });
      const op = await approveFinancialOperation(db, f.provider, f.input);
      expect(op.state).toBe(status.toUpperCase());
      expect(
        (
          await db.paymentRecord.findUniqueOrThrow({
            where: { id: f.payment.id },
          })
        ).status,
      ).toBe('SUCCEEDED');
      const [r] = await db.$queryRaw<
        ReviewRow[]
      >`SELECT * FROM "FinancialReview" WHERE id=${f.input.reviewId}`;
      expect(r.resolvedAt).toBeNull();
    },
  );
  it('rejects a mismatched independent receipt', async () => {
    const f = await fixture();
    const submit = f.provider.submit;
    f.provider.submit = vi.fn(async (op, beforeSubmission) => {
      const id = await submit(op,beforeSubmission);
      f.setReceipt({ ...f.getReceipt()!, amountCents: 999 });
      return id;
    });
    await expect(
      approveFinancialOperation(db, f.provider, f.input),
    ).rejects.toThrow('binding');
  });
  it('does not retry an expired unknown reservation', async () => {
    const f = await fixture();
    f.provider.submit = vi.fn(async () => {
      throw Error('timeout');
    });
    const op = await approveFinancialOperation(db, f.provider, f.input);
    await approveFinancialOperation(db, f.provider, f.input);
    expect(f.provider.submit).toHaveBeenCalledTimes(1);
    expect(
      (await reconcileFinancialOperation(db, f.provider, op.id)).state,
    ).toBe('UNKNOWN');
  });
  it('rejects stale review and changed approved amount', async () => {
    const f = await fixture();
    await expect(
      approveFinancialOperation(db, f.provider, {
        ...f.input,
        reviewVersion: 2,
      }),
    ).rejects.toThrow('changed');
    await expect(
      approveFinancialOperation(db, f.provider, {
        ...f.input,
        expectedAmountCents: 999,
      }),
    ).rejects.toThrow('Amount changed');
    expect(f.provider.submit).not.toHaveBeenCalled();
  });
  it('prevents mutation of approval payload in SQL', async () => {
    const f = await fixture();
    const op = await approveFinancialOperation(db, f.provider, f.input);
    await expect(
      db.$executeRaw`UPDATE "ApprovedFinancialOperation" SET "amountCents"=999 WHERE id=${op.id}`,
    ).rejects.toThrow('immutable');
  });
  it('permits one lifetime replacement across distinct approved-owner sessions', async () => {
    const f = await fixture();
    await db.paymentRecord.update({
      where: { id: f.payment.id },
      data: { status: 'REFUNDED', refundedAmountCents: 1000 },
    });
    await db.$executeRaw`UPDATE "FinancialReview" SET "resolvedAt"=now() WHERE id=${f.input.reviewId}`;
    const secondOwner = await db.user.create({
      data: { email: 'vanessa@rhyzefit.com', role: 'OWNER', status: 'ACTIVE' },
    });
    const input = {
      ...f.input,
      kind: 'REPLACEMENT' as const,
      reviewId: undefined,
      authorizationReference:
        'Synthetic original requester and exact $10 authorization',
    };
    const operations = await Promise.all([
      approveFinancialOperation(db, f.provider, input),
      approveFinancialOperation(db, f.provider, {
        ...input,
        actorId: secondOwner.id,
      }),
    ]);
    expect(operations[0].id).toBe(operations[1].id);
    expect(f.provider.submit).toHaveBeenCalledTimes(1);
    const original = await db.paymentRecord.findUniqueOrThrow({
      where: { id: f.payment.id },
    });
    expect(original.status).toBe('REFUNDED');
    const replacement = await db.paymentRecord.findUniqueOrThrow({
      where: { stripePaymentIntentId: f.getReceipt()!.paymentIntentId },
    });
    await db.paymentRecord.update({
      where: { id: replacement.id },
      data: { status: 'REFUNDED', refundedAmountCents: 1000 },
    });
    await expect(
      approveFinancialOperation(db, f.provider, {
        ...input,
        paymentRecordId: replacement.id,
      }),
    ).rejects.toThrow('cannot itself');
  });
  it('does not submit after a lost reservation commit acknowledgment', async () => {
    const f = await fixture();
    const lost = new Proxy(db, {
      get(target, key) {
        if (key === '$transaction')
          return async (callback: any, options: any) => {
            await target.$transaction(callback, options);
            throw Error('Lost commit acknowledgment');
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await expect(
      approveFinancialOperation(lost, f.provider, f.input),
    ).rejects.toThrow('Lost commit');
    const op = await approveFinancialOperation(db, f.provider, f.input);
    expect(op.state).toBe('UNKNOWN');
    expect(f.provider.submit).not.toHaveBeenCalled();
  });
  it('reconciles a webhook-first refund without reversing the accounting or attendance', async () => {
    const f = await fixture();
    const submit = f.provider.submit;
    f.provider.submit = vi.fn(async (op, beforeSubmission) => {
      await submit(op,beforeSubmission);
      throw Error('Process lost after provider success');
    });
    const op = await approveFinancialOperation(db, f.provider, f.input);
    await db.$transaction(async (tx) => {
      await financialLock(tx, f.booking.id, f.payment.stripePaymentIntentId!);
      await tx.paymentRecord.update({
        where: { id: f.payment.id },
        data: { status: 'REFUNDED', refundedAmountCents: 1000 },
      });
    });
    expect(
      (await reconcileFinancialOperation(db, f.provider, op.id)).state,
    ).toBe('SUCCEEDED');
    expect(f.provider.submit).toHaveBeenCalledTimes(1);
    expect(
      (await db.booking.findUniqueOrThrow({ where: { id: f.booking.id } }))
        .status,
    ).toBe('CONFIRMED');
  });
  it.each(['correction-first', 'approval-first'])(
    'preserves independent correction under an actual waiter: %s',
    async (order) => {
      const f = await fixture();
      let release!: () => void, entered!: () => void;
      const gate = new Promise<void>((r) => (release = r)),
        ready = new Promise<void>((r) => (entered = r));
      const correction = () =>
        db.$transaction(async (tx) => {
          await financialLock(
            tx,
            f.booking.id,
            f.payment.stripePaymentIntentId!,
          );
          await tx.booking.update({
            where: { id: f.booking.id },
            data: { status: 'ATTENDED' },
          });
          await requestFinancialReview(tx, {
            paymentIntentId: f.payment.stripePaymentIntentId!,
            reason: 'Synthetic correction remains independent',
          });
        });
      let first: Promise<unknown>, second: Promise<unknown>;
      if (order === 'correction-first') {
        first = db.$transaction(
          async (tx) => {
            await financialLock(
              tx,
              f.booking.id,
              f.payment.stripePaymentIntentId!,
            );
            entered();
            await gate;
            await tx.booking.update({
              where: { id: f.booking.id },
              data: { status: 'ATTENDED' },
            });
          },
          { timeout: 15000 },
        );
        await ready;
        second = approveFinancialOperation(db, f.provider, f.input);
      } else {
        const submit = f.provider.submit;
        f.provider.submit = async (op, beforeSubmission) => {
          entered();
          await gate;
          return submit(op,beforeSubmission);
        };
        first = approveFinancialOperation(db, f.provider, f.input);
        await ready;
        second = correction();
      }
      try {
        await waitForLock();
      } finally {
        release();
      }
      const results = await Promise.allSettled([first, second]);
      if (order === 'correction-first') {
        expect(results[1].status).toBe('rejected');
        expect(f.provider.submit).not.toHaveBeenCalled();
      } else expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(
        (await db.booking.findUniqueOrThrow({ where: { id: f.booking.id } }))
          .status,
      ).toBe('ATTENDED');
      expect(
        (
          await db.paymentRecord.findUniqueOrThrow({
            where: { id: f.payment.id },
          })
        ).status,
      ).toBe(order === 'correction-first' ? 'SUCCEEDED' : 'REFUNDED');
    },
  );
  it('keeps the service obligation when the service transaction rolls back', async () => {
    const f = await fixture();
    await db.$executeRaw`INSERT INTO "AttendanceCollection" ("bookingId","operationKey",state,"paymentIntentId") VALUES (${f.booking.id},${randomUUID()},'SUCCEEDED',${f.payment.stripePaymentIntentId})`;
    await expect(
      db.$transaction(async (tx) => {
        await confirmAttendanceService(
          tx,
          f.booking.id,
          f.payment.stripePaymentIntentId!,
        );
        throw Error('service failed');
      }),
    ).rejects.toThrow('service failed');
    const [row] = await db.$queryRaw<
      { serviceConfirmed: boolean }[]
    >`SELECT "serviceConfirmed" FROM "AttendanceCollection" WHERE "bookingId"=${f.booking.id}`;
    expect(row.serviceConfirmed).toBe(false);
  });
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
function actionClient() {
  return new Proxy(db, {
    get(target, key) {
      if (key === '$transaction')
        return (callback: any, options: any) =>
          target.$transaction(
            async (tx) => {
              const instrumented = new Proxy(tx, {
                get(t, k) {
                  if (k === '$executeRaw')
                    return async (
                      sql: TemplateStringsArray,
                      ...values: any[]
                    ) => {
                      const result = await t.$executeRaw(sql, ...values);
                      if (sql.join('').includes('pg_advisory_xact_lock'))
                        await actionHooks.afterBookingLock?.(values[0]);
                      return result;
                    };
                  const value = Reflect.get(t, k);
                  return typeof value === 'function' ? value.bind(t) : value;
                },
              });
              return callback(instrumented);
            },
            { ...options, timeout: 20000 },
          );
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
describe('actual roster and member transfer against native ownership', () => {
  it.each([
    'roster',
    'reschedule',
    'instructor-transfer',
    'member-cancel',
  ] as const)(
    'rejects refunded successful collection reuse through %s',
    async (path) => {
      const f = await actionFixture(path);
      await db.paymentRecord.update({
        where: { id: f.payment.id },
        data: { status: 'REFUNDED', refundedAmountCents: f.amount },
      });
      await expect(f.run()).rejects.toThrow(/receipt.*refunded/i);
      const current = await db.booking.findUniqueOrThrow({
        where: { id: f.booking.id },
        include: { attendance: true },
      });
      expect(current.occurrenceId).toBe(f.booking.occurrenceId);
      expect(current.attendance).toBeNull();
      expect(
        await db.bookingTransfer.count({ where: { bookingId: f.booking.id } }),
      ).toBe(0);
    },
  );
  it.each([
    ['roster', 'service-first'],
    ['roster', 'refund-first'],
    ['reschedule', 'service-first'],
    ['reschedule', 'refund-first'],
    ['instructor-transfer', 'service-first'],
    ['instructor-transfer', 'refund-first'],
    ['member-cancel', 'service-first'],
    ['member-cancel', 'refund-first'],
  ] as const)(
    '%s versus failed-service approval: %s lock winner',
    async (path, winner) => {
      const f = await actionFixture(path);
      const collected = deferred(),
        resumeService = deferred(),
        locked = deferred(),
        release = deferred();
      actionHooks.afterCharge = async () => {
        collected.resolve();
        await resumeService.promise;
      };
      const service = f.run().then(
        () => '',
        (e) => String(e.message),
      );
      await collected.promise;
      await db.$transaction((tx) =>
        requestFinancialReview(tx, {
          paymentIntentId: f.payment.stripePaymentIntentId!,
          reason: 'Synthetic service interrupted',
          basisKind: 'FAILED_SERVICE',
        }),
      );
      const [review] = await db.$queryRaw<
        ReviewRow[]
      >`SELECT * FROM "FinancialReview" WHERE "paymentRecordId"=${f.payment.id}`;
      const input = {
        ...f.input,
        reviewId: review.id,
        expectedAmountCents: f.amount,
      };
      let approval: Promise<any>;
      try {
        if (winner === 'service-first') {
          actionHooks.afterBookingLock = async (key) => {
            if (key === f.booking.id) {
              locked.resolve();
              await release.promise;
            }
          };
          resumeService.resolve();
          await locked.promise;
          approval = approveFinancialOperation(db, f.provider, input).then(
            (op) => op,
            (e) => e,
          );
        } else {
          const submit = f.provider.submit;
          f.provider.submit = vi.fn(async (op, beforeSubmission) => {
            locked.resolve();
            await release.promise;
            return submit(op,beforeSubmission);
          });
          approval = approveFinancialOperation(db, f.provider, input).then(
            (op) => op,
            (e) => e,
          );
          await locked.promise;
          resumeService.resolve();
        }
        await waitForLock();
      } finally {
        release.resolve();
        resumeService.resolve();
      }
      const [serviceResult, approvalResult] = await Promise.all([
        service,
        approval!,
      ]);
      actionHooks.afterCharge = null;
      actionHooks.afterBookingLock = null;
      const current = await db.booking.findUniqueOrThrow({
        where: { id: f.booking.id },
        include: { attendance: true },
      });
      const payment = await db.paymentRecord.findUniqueOrThrow({
        where: { id: f.payment.id },
      });
      const [collection] = await db.$queryRaw<
        { serviceConfirmed: boolean }[]
      >`SELECT "serviceConfirmed" FROM "AttendanceCollection" WHERE "bookingId"=${f.booking.id}`;
      if (winner === 'service-first') {
        expect(serviceResult).toContain(
          path === 'roster'
            ? 'attendance-no_show'
            : path === 'member-cancel'
              ? 'late-cancel-charged'
              : path === 'instructor-transfer'
                ? 'transfer=complete'
                : 'result=rescheduled',
        );
        expect(approvalResult).toBeInstanceOf(Error);
        expect(approvalResult.message).toMatch(/stale|changed|service/i);
        expect(f.provider.submit).not.toHaveBeenCalled();
        expect(collection.serviceConfirmed).toBe(true);
        expect(payment.status).toBe('SUCCEEDED');
        if (path === 'roster')
          expect(current.attendance?.status).toBe('NO_SHOW');
        else if (path === 'member-cancel')
          expect(current.status).toBe('LATE_CANCELLED');
        else expect(current.occurrenceId).toBe(f.destination.id);
      } else {
        expect(approvalResult.state).toBe('SUCCEEDED');
        expect(serviceResult).toMatch(/Refund owns|receipt.*refunded/);
        expect(collection.serviceConfirmed).toBe(false);
        expect(payment.status).toBe('REFUNDED');
        expect(current.attendance).toBeNull();
        expect(current.occurrenceId).toBe(f.booking.occurrenceId);
        expect(
          await db.bookingTransfer.count({
            where: { bookingId: f.booking.id },
          }),
        ).toBe(0);
        expect(
          await db.emailMessage.count({
            where: {
              userId: f.booking.userId,
              template: {
                in: [
                  'BOOKING_TRANSFERRED',
                  'BOOKING_CANCELLATION',
                  'CLASS_REMINDER',
                ],
              },
            },
          }),
        ).toBe(0);
        expect(
          await db.emailMessage.count({
            where: {
              userId: f.booking.userId,
              template: 'PAYMENT_REFUND_CONFIRMATION',
            },
          }),
        ).toBe(1);
      }
    },
    20000,
  );
  it('actual roster correction stores the resulting basis and rejects approval after a later correction', async () => {
    const f = await actionFixture('roster');
    // First no-show confirms the fee; subsequent correction creates its review atomically.
    await expect(f.run()).rejects.toThrow('attendance-no_show');
    const correction = new FormData();
    correction.set('bookingId', f.booking.id);
    correction.set('occurrenceId', f.booking.occurrenceId);
    correction.set('status', 'CHECKED_IN');
    await expect(markAttendanceAction(correction)).rejects.toThrow(
      'attendance-fee-review',
    );
    const [review] = await db.$queryRaw<
      ReviewRow[]
    >`SELECT * FROM "FinancialReview" WHERE "paymentRecordId"=${f.payment.id}`;
    expect(JSON.parse(review.basis!.snapshot).attendance.status).toBe(
      'CHECKED_IN',
    );
    // Toggle checked-in off: no fee collection is needed to change the correction basis.
    await expect(markAttendanceAction(correction)).rejects.toThrow(
      'attendance-cleared',
    );
    await expect(
      approveFinancialOperation(db, f.provider, {
        ...f.input,
        reviewId: review.id,
      }),
    ).rejects.toThrow(/stale|changed/);
    expect(f.provider.submit).not.toHaveBeenCalled();
  });
});
async function actionFixture(
  path: 'roster' | 'reschedule' | 'instructor-transfer' | 'member-cancel',
) {
  actionHooks.afterCharge = null;
  actionHooks.afterBookingLock = null;
  actionHooks.db = actionClient();
  const f = await fixture();
  await db.$executeRaw`DELETE FROM "FinancialReview" WHERE "paymentRecordId"=${f.payment.id}`;
  const amount = ['roster', 'member-cancel'].includes(path) ? 1000 : 500;
  const booking = await db.booking.update({
    where: { id: f.booking.id },
    data: {
      policySnapshot: {
        accessType: ['roster', 'member-cancel'].includes(path)
          ? 'INTRO_TRIAL'
          : 'STANDARD',
        accessProductKind: 'DROP_IN',
      },
    },
  });
  const occurrence = await db.classOccurrence.update({
    where: { id: booking.occurrenceId },
    data: {
      instructorId: path === 'instructor-transfer' ? owner : null,
      startAt: new Date(
        Date.now() + (path === 'member-cancel' ? 1 : 4) * 3600000,
      ),
      endAt: new Date(Date.now() + 5 * 3600000),
    },
  });
  const destination = await db.classOccurrence.create({
    data: {
      templateId: occurrence.templateId,
      startAt: new Date(Date.now() + 24 * 3600000),
      endAt: new Date(Date.now() + 25 * 3600000),
      capacity: 10,
    },
  });
  await db.paymentRecord.update({
    where: { id: f.payment.id },
    data: {
      amountCents: amount,
      kind:
        path === 'roster'
          ? 'NO_SHOW_FEE'
          : path === 'member-cancel'
            ? 'LATE_CANCELLATION_FEE'
            : 'TRANSFER_FEE',
    },
  });
  const key =
    path === 'roster'
      ? `no-show-fee-${booking.id}`
      : path === 'member-cancel'
        ? `late-cancel-fee-${booking.id}`
        : path === 'instructor-transfer'
          ? `transfer-fee-${booking.id}-${booking.occurrenceId}-${destination.id}`
          : `member-transfer-fee-${booking.id}-${booking.occurrenceId}-${destination.id}`;
  await db.$executeRaw`INSERT INTO "AttendanceCollection" ("bookingId","operationKey",state,"paymentIntentId") VALUES (${booking.id},${key},'SUCCEEDED',${f.payment.stripePaymentIntentId})`;
  actionHooks.actor = await db.user.findUniqueOrThrow({
    where: {
      id: ['roster', 'instructor-transfer'].includes(path)
        ? owner
        : booking.userId,
    },
  });
  const inspect = f.provider.inspect;
  f.provider.inspect = async (...args) => ({
    ...(await inspect(...args)),
    amountCents: amount,
    originalAmountCents: amount,
  });
  const submit = f.provider.submit;
  f.provider.submit = vi.fn(async (op, beforeSubmission) => {
    const id = await submit(op,beforeSubmission);
    f.setReceipt({ ...f.getReceipt()!, amountCents: amount });
    return id;
  });
  const form = new FormData();
  form.set('bookingId', booking.id);
  form.set('occurrenceId', booking.occurrenceId);
  form.set('status', 'NO_SHOW');
  form.set('destinationId', destination.id);
  return {
    ...f,
    booking,
    destination,
    amount,
    run: () =>
      path === 'roster'
        ? markAttendanceAction(form)
        : path === 'instructor-transfer'
          ? transferBookingAction(form)
          : path === 'member-cancel'
            ? cancelBookingAction(form)
            : rescheduleMemberBookingAction(form),
  };
}

describe('controlled-switch additional native coverage', () => {
  it('adjudicates a stale legacy case, versions it, and never expires an unknown operation', async () => {
    const f = await fixture();
    await db.$executeRaw`UPDATE "FinancialReview" SET basis=NULL WHERE id=${f.input.reviewId}`;
    await adjudicateFinancialReview(db, {
      actorId: owner,
      reviewId: f.input.reviewId,
      expectedVersion: 1,
      decision: 'REFRESH_BASIS',
      basisKind: 'PAYMENT_REFUND',
      evidence:
        'Synthetic legacy service and provider proof inspected, case 123',
    });
    f.provider.submit = vi.fn(async () => {
      throw Error('unknown transport');
    });
    const op = await approveFinancialOperation(db, f.provider, {
      ...f.input,
      reviewVersion: 2,
    });
    expect(op.state).toBe('UNKNOWN');
    await expect(
      adjudicateFinancialReview(db, {
        actorId: owner,
        reviewId: f.input.reviewId,
        expectedVersion: 2,
        decision: 'REFRESH_BASIS',
        evidence: 'Synthetic subsequent case review; no proof to clear owner',
      }),
    ).rejects.toThrow(/ownership/);
    await adjudicateFinancialReview(db, {
      actorId: owner,
      reviewId: f.input.reviewId,
      expectedVersion: 2,
      decision: 'INVESTIGATE',
      evidence: 'Synthetic subsequent case review; preserve uncertain owner',
    });
    await approveFinancialOperation(db, f.provider, {
      ...f.input,
      reviewVersion: 2,
    });
    expect(f.provider.submit).toHaveBeenCalledTimes(1);
    expect(
      await db.auditLog.count({
        where: {
          entityId: f.input.reviewId,
          action: 'financial.review-adjudicated',
        },
      }),
    ).toBe(2);
  });
  it('paginates more than 200 unresolved reviews with identical microsecond timestamps', async () => {
    const f = await fixture();
    await db.$executeRaw`INSERT INTO "FinancialReview" (id,"paymentRecordId",reason,"createdAt")
      SELECT 'pagination-'||lpad(n::text,4,'0'),${f.payment.id},'Pagination fixture '||n,'2000-01-01T00:00:00.123456Z'::timestamptz FROM generate_series(1,205) n`;
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await financialQueuePage(db, 'reviews', {
        cursor,
        limit: 50,
      });
      seen.push(
        ...page.rows
          .filter((r) => r.id.startsWith('pagination-'))
          .map((r) => r.id),
      );
      cursor = page.next ?? undefined;
    } while (cursor);
    expect(seen).toHaveLength(205);
    expect(new Set(seen).size).toBe(205);
    await db.$executeRaw`UPDATE "FinancialReview" SET "resolvedAt"=now() WHERE id LIKE 'pagination-%'`;
  });
  it('paginates replacement receipts in UTC even on a non-UTC database session', async () => {
    const f = await fixture();
    for (const id of ['candidate-a', 'candidate-b', 'candidate-c'])
      await db.paymentRecord.create({
        data: {
          id,
          userId: f.payment.userId,
          kind: 'NO_SHOW_FEE',
          status: 'REFUNDED',
          amountCents: 1000,
          refundedAmountCents: 1000,
          stripeEventId: id,
          stripePaymentIntentId: id,
          occurredAt: new Date('2001-01-01T18:00:00Z'),
        },
      });
    const first = await financialQueuePage(db, 'replacements', { limit: 2 });
    expect(first.rows.map((r) => r.id)).toEqual(['candidate-a', 'candidate-b']);
    const next = await financialQueuePage(db, 'replacements', {
      limit: 2,
      cursor: first.next!,
    });
    expect(next.rows[0].id).toBe('candidate-c');
  });
  it('assigns both owners and escalates overdue tasks exactly once across concurrent jobs', async () => {
    const f = await fixture();
    await db.$executeRaw`UPDATE "FinancialReview" SET "createdAt"=now()-interval '25 hours' WHERE id=${f.input.reviewId}`;
    const vanessa = await db.user.upsert({
      where: { email: 'vanessa@rhyzefit.com' },
      update: {},
      create: {
        email: 'vanessa@rhyzefit.com',
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
    const config = JSON.stringify({
      vanessa: { id: vanessa.id, email: vanessa.email },
      melissa: { id: owner, email: 'melissa@rhyzefit.com' },
      evidenceReference: 'synthetic-owned-database-fixture',
    });
    await Promise.all([
      maintainFinancialReviewTasks(db, config),
      maintainFinancialReviewTasks(db, config),
    ]);
    const notices = await db.inAppNotification.findMany({
      where: {
        dedupeKey: { startsWith: `financial-review:${f.input.reviewId}:` },
      },
    });
    expect(notices).toHaveLength(4);
    expect(new Set(notices.map((n) => n.userId))).toEqual(
      new Set([owner, vanessa.id]),
    );
    const [task] = await db.$queryRaw<
      { assignees: unknown[]; escalatedAt: Date }[]
    >`SELECT * FROM "FinancialTask" WHERE id=${f.input.reviewId}`;
    expect(task.assignees).toHaveLength(2);
    expect(task.escalatedAt).toBeInstanceOf(Date);
  });
  it('keeps a recurring renewal refund separate from its original purchase and service in webhook-first order', async () => {
    const f = await fixture();
    const product = await db.product.create({
      data: {
        name: 'Synthetic recurring',
        description: 'Synthetic recurring fixture',
        slug: randomUUID(),
        kind: 'VIP',
        billingInterval: 'MONTHLY',
        priceCents: 700,
      },
    });
    const purchase = await db.purchase.create({
      data: {
        userId: f.payment.userId!,
        productId: product.id,
        status: 'PAID',
        amountCents: 700,
        paidAt: new Date(),
        stripePaymentIntentId: randomUUID(),
      },
    });
    const membership = await db.membership.create({
      data: {
        userId: f.payment.userId!,
        productId: product.id,
        purchaseId: purchase.id,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 86400000),
        stripeSubscriptionId: randomUUID(),
        planChangeState: {
          fundingPaymentIntentIds: [f.payment.stripePaymentIntentId],
          paidAt: 1,
          paidEnd: 9999999999,
        },
      },
    });
    const account = await db.creditAccount.create({
      data: {
        userId: f.payment.userId!,
        sourcePurchaseId: purchase.id,
        label: 'Synthetic recurring credits',
        isUnlimited: true,
        validFrom: new Date(),
        validUntil: membership.currentPeriodEnd,
      },
    });
    const invoiceId = randomUUID();
    await db.paymentRecord.update({
      where: { id: f.payment.id },
      data: {
        bookingId: null,
        purchaseId: purchase.id,
        membershipId: membership.id,
        stripeSubscriptionId: membership.stripeSubscriptionId,
        stripeInvoiceId: invoiceId,
        kind: 'MEMBERSHIP_RENEWAL',
      },
    });
    await db.$executeRaw`UPDATE "FinancialReview" SET basis=${JSON.stringify({ kind: 'PAYMENT_REFUND', snapshot: JSON.stringify({ booking: null }) })}::jsonb WHERE id=${f.input.reviewId}`;
    const inspect = f.provider.inspect;
    f.provider.inspect = async (...args) => ({
      ...(await inspect(...args)),
      bookingId: null,
      servicePolicy: 'PRESERVE_RECURRING_SERVICE',
      subscriptionId: membership.stripeSubscriptionId!,
      invoiceId,
    });
    const submit = f.provider.submit;
    f.provider.submit = vi.fn(async (op, beforeSubmission) => {
      const result = await submit(op,beforeSubmission);
      // A separate provider callback lands before local reconciliation, after submit commits.
      return result;
    });
    const originalReceipt = f.provider.receipt;
    let delivered = false;
    f.provider.receipt = async (op) => {
      if (!delivered) {
        delivered = true;
        const r = f.getReceipt()!;
        await db.$transaction((tx) =>
          processStripeEvent(tx, {
            id: randomUUID(),
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            type: 'charge.refunded',
            data: {
              object: {
                id: r.chargeId,
                payment_intent: r.paymentIntentId,
                livemode: false,
                currency: 'usd',
                amount_refunded: 1000,
                refunded: true,
                refunds: {
                  has_more: false,
                  data: [
                    {
                      id: r.id,
                      charge: r.chargeId,
                      payment_intent: r.paymentIntentId,
                      amount: 1000,
                      currency: 'usd',
                      status: 'succeeded',
                      metadata: { approvedOperationId: op.id },
                    },
                  ],
                },
              },
            },
          } as any),
        );
      }
      return originalReceipt(op);
    };
    expect(
      (await approveFinancialOperation(db, f.provider, f.input)).state,
    ).toBe('SUCCEEDED');
    expect(
      await db.purchase.findUniqueOrThrow({ where: { id: purchase.id } }),
    ).toEqual(purchase);
    expect(
      await db.membership.findUniqueOrThrow({ where: { id: membership.id } }),
    ).toEqual(membership);
    expect(
      await db.creditAccount.findUniqueOrThrow({ where: { id: account.id } }),
    ).toEqual(account);
    expect(
      await db.paymentRecord.findUniqueOrThrow({ where: { id: f.payment.id } }),
    ).toMatchObject({ status: 'REFUNDED', refundedAmountCents: 1000 });
  });
});
