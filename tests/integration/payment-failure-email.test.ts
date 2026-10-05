import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { queuePaymentFailureEmail } from '@/lib/notifications/payment-failure';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';
vi.mock('@/lib/auth/owner-access', () => ({ approvedOwnerEmails: () => ['payment-failure-admin@example.test'] }));
const url = process.env.PLAN_CHANGE_TEST_DATABASE_URL;
if (
  url &&
  (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/membership_plan_test')
)
  throw Error('Use disposable local membership_plan_test only');
describe.skipIf(!url)(
  'real database payment failure email deduplication',
  () => {
    const db = new PrismaClient({ datasourceUrl: url });
    const prefix = `failure-notice-test-${randomUUID()}`;
    afterAll(async () => {
      await db.emailMessage.deleteMany({
        where: { dedupeKey: { contains: prefix } },
      });
      await db.inAppNotification.deleteMany({
        where: { dedupeKey: { contains: prefix } },
      });
      await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
      await db.$disconnect();
    });
    it('queues one notice for simultaneous retries, retains sent status, and allows the next invoice', async () => {
      await db.user.create({ data: { id: `${prefix}-owner`, role: 'OWNER', email: 'payment-failure-admin@example.test', status: 'ACTIVE' } });
    const user = await db.user.create({
        data: { id: prefix, email: `${prefix}@example.test` },
      });
      const invoice = {
        id: `${prefix}-invoice`,
        status: 'open',
        amount_due: 19900,
        currency: 'usd',
      };
      const run = (id: string) =>
        retrySerializableTransaction(() =>
          db.$transaction(
            async (tx) => {
              // Invoice processing already serializes on a membership/purchase row.
              await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${prefix} FOR UPDATE`;
              await queuePaymentFailureEmail(tx, user, { ...invoice, id });
            },
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          ),
        );
      await Promise.all([run(invoice.id), run(invoice.id)]);
      expect(
        await db.emailMessage.count({
          where: { dedupeKey: { contains: prefix } },
        }),
      ).toBe(3);
      await db.emailMessage.updateMany({
        where: { dedupeKey: { contains: prefix } },
        data: { status: 'SENT' },
      });
      await run(invoice.id);
      expect(
        await db.emailMessage.findFirst({
          where: { dedupeKey: { contains: prefix } },
        }),
      ).toMatchObject({ status: 'SENT' });
      const alerts = await db.inAppNotification.findMany({ where: { dedupeKey: { contains: prefix } } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ userId: `${prefix}-owner`, link: `/admin/members/${prefix}#payment-history` });
    expect(alerts[0].body).toContain('$199.00');
    await run(`${prefix}-next-invoice`);
      expect(
        await db.emailMessage.count({
          where: { dedupeKey: { contains: prefix } },
        }),
      ).toBe(6);
    });
  },
);
