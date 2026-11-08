import type Stripe from 'stripe';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { linkStripePaymentRecordToMember } from '@/lib/admin/stripe-payment-linking';
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { PrismaClient, type Prisma, type Role } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { cancelAdminIntroTrial } from '@/lib/domain/memberships/cancel-intro-trial';
import { lockMembershipEntitlements } from '@/lib/domain/credits/entitlement-lock';

// Deliberately fail, never silently skip or fall back to an application database.
const url = process.env.CALLBACK_TEST_DATABASE_URL;
const ownedDirectory = process.env.TRIAL_TEST_DATABASE_DIR;
const db = new PrismaClient({
  datasourceUrl:
    url || 'postgresql://invalid:invalid@127.0.0.1:1/callback_test',
});
const prefix = 'trial-cancel-' + randomUUID();
const now = new Date();
const actorId = prefix + '-owner';
async function assertOwnedDatabase() {
  if (!url || !ownedDirectory || !isAbsolute(ownedDirectory))
    throw Error(
      'An explicit owned disposable PostgreSQL cluster and TRIAL_TEST_DATABASE_DIR are required',
    );
  const parsed = new URL(url);
  if (
    !['postgresql:', 'postgres:'].includes(parsed.protocol) ||
    parsed.hostname !== '127.0.0.1' ||
    parsed.pathname !== '/callback_test' ||
    !parsed.port ||
    parsed.search ||
    parsed.hash
  )
    throw Error('Only explicit loopback callback_test is accepted');
  const [identity] = await db.$queryRaw<
    { name: string; address: string; port: number; directory: string }[]
  >`SELECT current_database() AS name, host(inet_server_addr()) AS address, inet_server_port() AS port, current_setting('data_directory') AS directory`;
  if (
    identity.name !== 'callback_test' ||
    identity.address !== '127.0.0.1' ||
    identity.port !== Number(parsed.port) ||
    (await realpath(identity.directory)) !== (await realpath(ownedDirectory))
  )
    throw Error('Owned database identity mismatch; fixture writes refused');
}
async function fixture(withTrialBooking = false) {
  await assertOwnedDatabase();
  const id = prefix + '-' + randomUUID();
  await db.user.create({
    data: { id, email: id + '@example.test', status: 'ACTIVE' },
  });
  const product = await db.product.create({
    data: {
      name: 'Synthetic 7-day trial',
      slug: id,
      description: 'Test only',
      kind: 'INTRO_TRIAL',
      priceCents: 700,
      trialDays: 7,
      isUnlimited: true,
    },
  });
  const purchase = await db.purchase.create({
    data: {
      userId: id,
      productId: product.id,
      amountCents: 700,
      status: 'PARTIALLY_REFUNDED',
      refundedAmountCents: 100,
      paidAt: now,
      stripePaymentIntentId: `pi_${id}`,
    },
  });
  const membership = await db.membership.create({
    data: {
      userId: id,
      productId: product.id,
      purchaseId: purchase.id,
      status: 'TRIALING',
      currentPeriodStart: now,
      activatedAt: now,
      currentPeriodEnd: new Date(+now + 7 * 86400000),
    },
  });
  const credit = await db.creditAccount.create({
    data: {
      userId: id,
      sourcePurchaseId: purchase.id,
      label: 'Synthetic trial',
      isUnlimited: true,
      validFrom: now,
      validUntil: membership.currentPeriodEnd,
    },
  });
  await db.refund.create({
    data: {
      purchaseId: purchase.id,
      amountCents: 100,
      stripeRefundId: id + '-refund',
    },
  });
  await db.paymentRecord.create({
    data: {
      userId: id,
      purchaseId: purchase.id,
      membershipId: membership.id,
      kind: 'PRODUCT_PURCHASE',
      status: 'SUCCEEDED',
      amountCents: 700,
      refundedAmountCents: 100,
      stripeEventId: id,
      stripePaymentIntentId: `pi_${id}`,
    },
  });
  const category = await db.classCategory.create({
    data: { name: id, slug: id },
  });
  const template = await db.classTemplate.create({
    data: {
      name: 'Synthetic class',
      slug: id,
      categoryId: category.id,
      description: 'Test',
      durationMinutes: 50,
      defaultCapacity: 10,
      tags: [],
      equipment: [],
    },
  });
  const occurrence = await db.classOccurrence.create({
    data: {
      templateId: template.id,
      startAt: new Date(+now + 86400000),
      endAt: new Date(+now + 90000000),
      capacity: 10,
    },
  });
  const booking = withTrialBooking
    ? await db.booking.create({
        data: {
          userId: id,
          occurrenceId: occurrence.id,
          policySnapshot: {
            accessType: 'INTRO_TRIAL',
            creditAccountId: credit.id,
          },
        },
      })
    : null;
  await db.emailMessage.create({
    data: {
      userId: id,
      to: id + '@example.test',
      subject: 'Synthetic reminder',
      template: 'TRIAL_ENDING',
      status: 'QUEUED',
      payload: { membershipId: membership.id },
      dedupeKey: `trial-ending:${membership.id}`,
    },
  });
  const unrelatedCredit = await db.creditAccount.create({
    data: {
      userId: id,
      label: 'Unrelated paid pack',
      validUntil: new Date(+now + 30 * 86400000),
      entries: { create: { type: 'GRANT', quantity: 4 } },
    },
  });
  const second = await db.classOccurrence.create({
    data: {
      templateId: template.id,
      startAt: new Date(+now + 2 * 86400000),
      endAt: new Date(+now + 2 * 86400000 + 3600000),
      capacity: 10,
    },
  });
  const unrelatedBooking = await db.booking.create({
    data: {
      userId: id,
      occurrenceId: second.id,
      policySnapshot: {
        accessType: 'STANDARD',
        creditAccountId: unrelatedCredit.id,
      },
    },
  });
  const input = {
    actorId,
    userId: id,
    membershipId: membership.id,
    confirmed: true,
    reason: 'Owner-requested paid upgrade',
  };
  return {
    id,
    input,
    product,
    purchase,
    membership,
    credit,
    booking,
    occurrence,
    unrelatedCredit,
    unrelatedBooking,
  };
}
async function history(userId: string) {
  return {
    purchases: await db.purchase.findMany({
      where: { userId },
      include: { refunds: true, invoice: true },
    }),
    payments: await db.paymentRecord.findMany({ where: { userId } }),
    entries: await db.creditLedgerEntry.findMany({
      where: { creditAccount: { userId } },
    }),
  };
}
describe('atomic intro trial cancellation on owned PostgreSQL', () => {
  beforeAll(async () => {
    await assertOwnedDatabase();
    await db.user.create({
      data: {
        id: actorId,
        email: actorId + '@example.test',
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  it('cancels only unbooked trial access, preserving financial history and unrelated bookings', async () => {
    const f = await fixture();
    const before = await history(f.id);
    const result = await cancelAdminIntroTrial(db, f.input);
    expect(result.status).toBe('cancelled');
    expect(
      await db.membership.findUnique({ where: { id: f.membership.id } }),
    ).toMatchObject({ status: 'CANCELLED', cancelAtPeriodEnd: false });
    expect(
      (
        await db.creditAccount.findUniqueOrThrow({ where: { id: f.credit.id } })
      ).validUntil!.getTime(),
    ).toBeLessThanOrEqual(Date.now());
    expect(f.booking).toBeNull();
    expect(
      await db.booking.findUnique({ where: { id: f.unrelatedBooking.id } }),
    ).toEqual(f.unrelatedBooking);
    expect(
      await db.creditAccount.findUnique({
        where: { id: f.unrelatedCredit.id },
      }),
    ).toEqual(f.unrelatedCredit);
    expect(await history(f.id)).toEqual(before);
    expect(
      await db.emailMessage.findFirst({ where: { userId: f.id } }),
    ).toMatchObject({ status: 'CANCELLED' });
    expect(
      await db.auditLog.count({
        where: {
          entityId: f.membership.id,
          action: 'membership.intro_trial_cancelled',
        },
      }),
    ).toBe(1);
  });
  it('serializes concurrent cancellation and replays the same durable receipt', async () => {
    const f = await fixture();
    const results = await Promise.all([
      cancelAdminIntroTrial(db, f.input),
      cancelAdminIntroTrial(db, f.input),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([
      'already_cancelled',
      'cancelled',
    ]);
    expect(results[0].auditId).toBe(results[1].auditId);
    expect((await cancelAdminIntroTrial(db, f.input)).auditId).toBe(
      results[0].auditId,
    );
    expect(
      await db.auditLog.count({ where: { entityId: f.membership.id } }),
    ).toBe(1);
  });
  it.each(['CONFIRMED', 'CANCELLED', 'LATE_CANCELLED', 'ATTENDED'] as const)(
    'fails closed for %s trial booking history without touching any row or financial history',
    async (status) => {
      const f = await fixture(true);
      await db.booking.update({
        where: { id: f.booking!.id },
        data: { status },
      });
      const before = await history(f.id);
      const bookings = await db.booking.findMany({
        where: { userId: f.id },
        orderBy: { id: 'asc' },
      });
      const messages = await db.emailMessage.findMany({
        where: { userId: f.id },
      });
      await expect(cancelAdminIntroTrial(db, f.input)).rejects.toThrow(
        /booking history.*review/i,
      );
      expect(await history(f.id)).toEqual(before);
      expect(
        await db.booking.findMany({
          where: { userId: f.id },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(bookings);
      expect(
        await db.emailMessage.findMany({ where: { userId: f.id } }),
      ).toEqual(messages);
      expect(
        await db.membership.findUnique({ where: { id: f.membership.id } }),
      ).toEqual(f.membership);
      expect(
        await db.creditAccount.findUnique({ where: { id: f.credit.id } }),
      ).toEqual(f.credit);
      expect(
        await db.auditLog.count({ where: { entityId: f.membership.id } }),
      ).toBe(0);
    },
  );
  it('refuses a pending freeze on an unused trial atomically', async () => {
    const f = await fixture();
    const unused = await db.membership.update({
      where: { id: f.membership.id },
      data: { activatedAt: null, currentPeriodEnd: null },
    });
    const freeze = await db.membershipFreeze.create({
      data: {
        membershipId: f.membership.id,
        createdById: actorId,
        startAt: new Date(+now + 86400000),
        endAt: new Date(+now + 2 * 86400000),
      },
    });
    const before = await history(f.id);
    await expect(cancelAdminIntroTrial(db, f.input)).rejects.toThrow(
      /freeze.*review/i,
    );
    expect(
      await db.membership.findUnique({ where: { id: f.membership.id } }),
    ).toEqual(unused);
    expect(
      await db.membershipFreeze.findUnique({ where: { id: freeze.id } }),
    ).toEqual(freeze);
    expect(await history(f.id)).toEqual(before);
    expect(
      await db.auditLog.count({ where: { entityId: f.membership.id } }),
    ).toBe(0);
  });
  it.each(['PAID', 'PARTIALLY_REFUNDED'] as const)(
    'actual checkout replay after cancellation preserves %s purchase/payment/refund history',
    async (status) => {
      const f = await fixture();
      await db.purchase.update({
        where: { id: f.purchase.id },
        data: { status, refundedAmountCents: status === 'PAID' ? 0 : 100 },
      });
      await cancelAdminIntroTrial(db, f.input);
      const before = await history(f.id);
      const membership = await db.membership.findUnique({
        where: { id: f.membership.id },
      });
      const account = await db.creditAccount.findUnique({
        where: { id: f.credit.id },
      });
      const replay = {
        id: `evt_${randomUUID()}`,
        type: 'checkout.session.completed',
        created: Math.floor(+now / 1000),
        data: {
          object: {
            id: `cs_${f.id}`,
            amount_total: 700,
            currency: 'usd',
            payment_status: 'paid',
            metadata: { purchaseId: f.purchase.id },
          },
        },
      } as unknown as Stripe.Event;
      await db.$transaction((tx) => processStripeEvent(tx, replay));
      await db.$transaction((tx) =>
        processStripeEvent(tx, { ...replay, id: `evt_${randomUUID()}` }),
      );
      expect(await history(f.id)).toEqual(before);
      expect(
        await db.membership.findUnique({ where: { id: f.membership.id } }),
      ).toEqual(membership);
      expect(
        await db.creditAccount.findUnique({ where: { id: f.credit.id } }),
      ).toEqual(account);
      expect(
        await db.auditLog.count({ where: { entityId: f.membership.id } }),
      ).toBe(1);
    },
  );
  it('serializes a checkout replay that read the purchase before cancellation committed', async () => {
    const f = await fixture();
    const before = await history(f.id);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let written!: () => void;
    const receiptWritten = new Promise<void>((resolve) => {
      written = resolve;
    });
    const cancellationDb = db.$extends({
      query: {
        auditLog: {
          async create({ args, query }) {
            const result = await query(args);
            written();
            await gate;
            return result;
          },
        },
      },
    });
    const cancellation = cancelAdminIntroTrial(
      cancellationDb as unknown as PrismaClient,
      f.input,
    );
    await receiptWritten;
    let read!: () => void;
    const initialRead = new Promise<void>((resolve) => {
      read = resolve;
    });
    let reads = 0;
    const replayDb = db.$extends({
      query: {
        purchase: {
          async findUnique({ args, query }) {
            const result = await query(args);
            if (++reads === 1) read();
            return result;
          },
        },
      },
    });
    const event = {
      id: `evt_${randomUUID()}`,
      type: 'checkout.session.completed',
      created: Math.floor(+now / 1000),
      data: {
        object: {
          id: `cs_${f.id}`,
          amount_total: 700,
          currency: 'usd',
          payment_status: 'paid',
          metadata: { purchaseId: f.purchase.id },
        },
      },
    } as unknown as Stripe.Event;
    const replay = replayDb.$transaction((tx) =>
      processStripeEvent(tx as unknown as Prisma.TransactionClient, event),
    );
    try {
      await initialRead;
    } finally {
      release();
    }
    await Promise.all([cancellation, replay]);
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(await history(f.id)).toEqual(before);
    expect(
      await db.membership.findUnique({ where: { id: f.membership.id } }),
    ).toMatchObject({ status: 'CANCELLED' });
    expect(
      (
        await db.creditAccount.findUniqueOrThrow({ where: { id: f.credit.id } })
      ).validUntil!.getTime(),
    ).toBeLessThanOrEqual(Date.now());
    expect(
      await db.auditLog.count({ where: { entityId: f.membership.id } }),
    ).toBe(1);
  });
  it.each([true, false])(
    'Sales replay cannot reopen cancelled access with payment linkage present=%s',
    async (linked) => {
      const f = await fixture();
      if (!linked)
        await db.paymentRecord.updateMany({
          where: { userId: f.id },
          data: { purchaseId: null, membershipId: null },
        });
      await cancelAdminIntroTrial(db, f.input);
      const before = await history(f.id);
      const membership = await db.membership.findUnique({
        where: { id: f.membership.id },
      });
      const account = await db.creditAccount.findUnique({
        where: { id: f.credit.id },
      });
      const payment = await db.paymentRecord.findFirstOrThrow({
        where: { userId: f.id },
      });
      expect(
        await db.$transaction((tx) =>
          linkStripePaymentRecordToMember(tx, {
            paymentRecordId: payment.id,
            memberEmail: f.id + '@example.test',
            actorId,
            grantIntroTrial: true,
          }),
        ),
      ).toMatchObject({ ok: false, reason: 'intro-trial-already-granted' });
      expect(await history(f.id)).toEqual(before);
      expect(
        await db.membership.findUnique({ where: { id: f.membership.id } }),
      ).toEqual(membership);
      expect(
        await db.creditAccount.findUnique({ where: { id: f.credit.id } }),
      ).toEqual(account);
      expect(await db.auditLog.count({ where: { entityId: payment.id } })).toBe(
        0,
      );
    },
  );
  it.each(['ADMIN', 'MANAGER'] as Role[])(
    'allows active %s through shared admin policy',
    async (role) => {
      const f = await fixture();
      const staff = await db.user.create({
        data: { email: randomUUID() + '@example.test', role, status: 'ACTIVE' },
      });
      expect(
        (await cancelAdminIntroTrial(db, { ...f.input, actorId: staff.id }))
          .status,
      ).toBe('cancelled');
    },
  );
  it.each(['MEMBER', 'INSTRUCTOR'] as Role[])(
    'rejects %s without changes',
    async (role) => {
      const f = await fixture();
      const actor = await db.user.create({
        data: { email: randomUUID() + '@example.test', role, status: 'ACTIVE' },
      });
      await expect(
        cancelAdminIntroTrial(db, { ...f.input, actorId: actor.id }),
      ).rejects.toThrow(/authorized/i);
      expect(
        await db.membership.findUnique({ where: { id: f.membership.id } }),
      ).toEqual(f.membership);
    },
  );
  it('rejects missing/disabled actors, wrong client and absent confirmation', async () => {
    const f = await fixture();
    const actor = await db.user.create({
      data: {
        email: randomUUID() + '@example.test',
        role: 'ADMIN',
        status: 'INVITED',
      },
    });
    for (const patch of [
      { actorId: 'missing' },
      { actorId: actor.id },
      { userId: 'wrong' },
      { confirmed: false },
    ])
      await expect(
        cancelAdminIntroTrial(db, { ...f.input, ...patch }),
      ).rejects.toThrow();
    expect(
      await db.membership.findUnique({ where: { id: f.membership.id } }),
    ).toEqual(f.membership);
  });
  it('fails atomically on ambiguous provenance or existing attendance/financial booking records', async () => {
    for (const reason of [
      'provenance',
      'foreign-account',
      'attendance',
      'payment',
      'billing-lock',
    ]) {
      const f = await fixture(true);
      if (reason === 'provenance')
        await db.booking.update({
          where: { id: f.booking!.id },
          data: { policySnapshot: {} },
        });
      if (reason === 'foreign-account')
        await db.booking.update({
          where: { id: f.booking!.id },
          data: {
            policySnapshot: {
              accessType: 'INTRO_TRIAL',
              creditAccountId: 'missing-or-foreign',
            },
          },
        });
      if (reason === 'attendance')
        await db.attendanceRecord.create({
          data: {
            userId: f.id,
            bookingId: f.booking!.id,
            occurrenceId: f.occurrence.id,
            status: 'ATTENDED',
          },
        });
      if (reason === 'payment')
        await db.paymentRecord.create({
          data: {
            userId: f.id,
            bookingId: f.booking!.id,
            kind: 'TRANSFER_FEE',
            status: 'SUCCEEDED',
            amountCents: 500,
            stripeEventId: randomUUID(),
          },
        });
      if (reason === 'billing-lock')
        await db.membership.update({
          where: { id: f.membership.id },
          data: { billingLockToken: 'pending-operation' },
        });
      const before = await history(f.id);
      await expect(cancelAdminIntroTrial(db, f.input)).rejects.toThrow(
        /review/i,
      );
      expect(await history(f.id)).toEqual(before);
      expect(
        (
          await db.membership.findUniqueOrThrow({
            where: { id: f.membership.id },
          })
        ).status,
      ).toBe('TRIALING');
      expect(
        await db.auditLog.count({ where: { entityId: f.membership.id } }),
      ).toBe(0);
    }
  });
  it('refuses a claimed reminder atomically instead of claiming to revoke an in-flight send', async () => {
    const f = await fixture();
    await db.emailMessage.updateMany({
      where: { userId: f.id },
      data: { status: 'PROCESSING' },
    });
    await expect(cancelAdminIntroTrial(db, f.input)).rejects.toThrow(
      /email.*review/i,
    );
    expect(
      await db.membership.findUnique({ where: { id: f.membership.id } }),
    ).toEqual(f.membership);
    expect(
      await db.booking.findUnique({ where: { id: f.unrelatedBooking.id } }),
    ).toEqual(f.unrelatedBooking);
    expect(
      await db.emailMessage.findFirst({ where: { userId: f.id } }),
    ).toMatchObject({ status: 'PROCESSING' });
  });
  it('fails without waiting on a purchase being settled by the refund writer', async () => {
    const f = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let locked!: () => void;
    const ready = new Promise<void>((r) => {
      locked = r;
    });
    const refund = db.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: f.purchase.id },
        data: { refundedAmountCents: 700, status: 'REFUNDED' },
      });
      locked();
      await gate;
      await tx.membership.update({
        where: { id: f.membership.id },
        data: { status: 'CANCELLED' },
      });
    });
    await ready;
    try {
      await expect(cancelAdminIntroTrial(db, f.input)).rejects.toThrow();
    } finally {
      release();
      await refund;
    }
    expect(
      await db.purchase.findUnique({ where: { id: f.purchase.id } }),
    ).toMatchObject({ status: 'REFUNDED', refundedAmountCents: 700 });
    expect(
      await db.auditLog.count({ where: { entityId: f.membership.id } }),
    ).toBe(0);
  });
  it('rechecks and refuses a trial booking inserted after its initial roster read', async () => {
    const f = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let read!: () => void;
    const ready = new Promise<void>((r) => {
      read = r;
    });
    let paused = false;
    const intercepted = db.$extends({
      query: {
        booking: {
          async findMany({ args, query }) {
            const result = await query(args);
            if (args.select?.occurrenceId && !paused) {
              paused = true;
              read();
              await gate;
            }
            return result;
          },
        },
      },
    });
    const cancellation = expect(
      cancelAdminIntroTrial(intercepted as unknown as PrismaClient, f.input),
    ).rejects.toThrow(/booking history.*review/i);
    await ready;
    const third = await db.classOccurrence.create({
      data: {
        templateId: f.occurrence.templateId,
        startAt: new Date(+now + 3 * 86400000),
        endAt: new Date(+now + 3 * 86400000 + 3600000),
        capacity: 10,
      },
    });
    try {
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${third.id}))`;
        await lockMembershipEntitlements(tx, f.id);
        await tx.booking.create({
          data: {
            userId: f.id,
            occurrenceId: third.id,
            policySnapshot: {
              accessType: 'INTRO_TRIAL',
              creditAccountId: f.credit.id,
            },
          },
        });
      });
    } finally {
      release();
    }
    await cancellation;
    expect(
      await db.booking.findFirst({
        where: { userId: f.id, occurrenceId: third.id },
      }),
    ).toMatchObject({ status: 'CONFIRMED' });
    expect(
      await db.auditLog.count({ where: { entityId: f.membership.id } }),
    ).toBe(0);
  });
  it('waits for an in-flight booking and refuses cancellation without altering it', async () => {
    const f = await fixture();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let locked!: () => void;
    const ready = new Promise<void>((r) => {
      locked = r;
    });
    const booking = db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${f.occurrence.id}))`;
      await lockMembershipEntitlements(tx, f.id);
      locked();
      await gate;
      return tx.booking.update({
        where: { id: f.unrelatedBooking.id },
        data: {
          policySnapshot: {
            accessType: 'INTRO_TRIAL',
            creditAccountId: f.credit.id,
          },
        },
      });
    });
    await ready;
    const cancellation = expect(
      cancelAdminIntroTrial(db, f.input),
    ).rejects.toThrow(/booking history.*review/i);
    release();
    await booking;
    await cancellation;
    expect(
      await db.booking.count({ where: { userId: f.id, status: 'CONFIRMED' } }),
    ).toBe(1);
  });
});
