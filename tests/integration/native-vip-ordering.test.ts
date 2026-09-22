import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: vi.fn() }));

const url = process.env.VIP_TEST_DATABASE_URL;
if (url && (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    !['/identity_migration', '/vip_entitlement_test'].includes(new URL(url).pathname))) {
  throw Error('VIP tests require an explicitly named disposable local test database, never preview or production');
}
const sep = Date.parse('2026-09-03T16:00Z') / 1000;
const oct = Date.parse('2026-10-03T16:00Z') / 1000;
const nov = Date.parse('2026-11-03T16:00Z') / 1000;
describe.skipIf(!url)('native VIP overlapping PostgreSQL events', () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const prefix = `vip-order-test-${randomUUID()}`;
  afterAll(async () => {
    await db.paymentRecord.deleteMany({ where: { userId: { startsWith: prefix } } });
    await db.creditAccount.deleteMany({ where: { userId: { startsWith: prefix } } });
    await db.membership.deleteMany({ where: { userId: { startsWith: prefix } } });
    await db.purchase.deleteMany({ where: { userId: { startsWith: prefix } } });
    await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.product.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.$disconnect();
  });
  async function fixture() {
    const id = `${prefix}-${randomUUID()}`;
    await db.user.create({ data: { id, email: `${id}@example.test` } });
    await db.product.create({ data: { id, name: 'Synthetic VIP', slug: id, description: 'Test only', kind: 'VIP',
      priceCents: 22200, billingInterval: 'MONTHLY', isUnlimited: true, eligibleCategoryIds: [] } });
    await db.purchase.create({ data: { id, userId: id, productId: id, status: 'PAID', amountCents: 22200, paidAt: new Date(sep * 1000) } });
    await db.membership.create({ data: { id, userId: id, productId: id, purchaseId: id, stripeSubscriptionId: id,
      status: 'ACTIVE', currentPeriodStart: new Date(sep * 1000), currentPeriodEnd: new Date(oct * 1000) } });
    await db.creditAccount.create({ data: { userId: id, sourcePurchaseId: id, label: 'Synthetic VIP', isUnlimited: true,
      validFrom: new Date(sep * 1000), validUntil: new Date(oct * 1000) } });
    const invoice = (suffix: string, start: number, end: number) => ({ id: `${id}-${suffix}`, subscription: id, status: 'paid',
      amount_paid: 22200, amount_due: 22200, currency: 'usd', status_transitions: { paid_at: start + 10 },
      lines: { data: [{ type: 'subscription', period: { start, end } }] } });
    const event = (type: string, suffix: string, at: number, object: unknown) => ({ id: `${id}-${suffix}`, type, created: at, data: { object } }) as Stripe.Event;
    const paid = event('invoice.paid', 'new-event', oct + 10, invoice('new', oct, nov));
    const process = (event: Stripe.Event) => retrySerializableTransaction(() => db.$transaction(
      tx => processStripeEvent(tx, event), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 },
    ));
    return { id, invoice, event, paid, process };
  }
  it.each(['invoice.paid', 'invoice.payment_failed', 'customer.subscription.updated'])('rereads after a newer commit despite an overlapping stale %s pre-lock read', async type => {
    const f = await fixture();
    const stale = f.event(type, 'old-event', sep + 10, type === 'customer.subscription.updated'
      ? { id: f.id, status: 'past_due', current_period_start: sep, current_period_end: oct }
      : f.invoice('old', sep, oct));
    let release!: () => void;
    let observed!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const didRead = new Promise<void>(resolve => { observed = resolve; });
    const staleRun = db.$transaction(async tx => {
      let first = true;
      const wrapped = new Proxy(tx, { get(target, property) {
        if (property !== 'membership') return Reflect.get(target, property);
        return new Proxy(target.membership, { get(delegate, method) {
          if (method !== 'findUnique') return Reflect.get(delegate, method);
          return async (...args: Parameters<typeof delegate.findUnique>) => {
            const result = await delegate.findUnique(...args);
            if (first) { first = false; observed(); await gate; }
            return result;
          };
        } });
      } });
      await processStripeEvent(wrapped, stale);
    }, { timeout: 10000 });
    try { await didRead; await f.process(f.paid); } finally { release(); }
    await staleRun;
    const membership = await db.membership.findUniqueOrThrow({ where: { id: f.id }, include: { purchase: { include: { creditAccount: true } } } });
    expect(membership.status).toBe('ACTIVE');
    expect(membership.currentPeriodEnd).toEqual(new Date(nov * 1000));
    expect(membership.purchase?.creditAccount?.validUntil).toEqual(new Date(nov * 1000));
    const record = await db.paymentRecord.findUniqueOrThrow({ where: { stripeInvoiceId: `${f.id}-new` } });
    expect(record.status).toBe('SUCCEEDED');
    if (type === 'invoice.paid') expect(await db.paymentRecord.count({ where: { userId: f.id, status: 'SUCCEEDED' } })).toBe(2);
  }, 20000);
  it('serializes simultaneous duplicate paid deliveries under the webhook retry policy', async () => {
    const f = await fixture();
    await Promise.all([f.process(f.paid), f.process({ ...f.paid, id: `${f.id}-duplicate` })]);
    expect(await db.paymentRecord.count({ where: { userId: f.id } })).toBe(1);
    const account = await db.creditAccount.findUniqueOrThrow({ where: { sourcePurchaseId: f.id } });
    expect(account.validUntil).toEqual(new Date(nov * 1000));
    expect(await db.creditLedgerEntry.count({ where: { creditAccountId: account.id } })).toBe(0);
  }, 20000);
  it.each(['failed-first', 'paid-first'])('settles a same-second failure/payment pair once (%s), including concurrent replays', async order => {
    const f = await fixture();
    const failure = f.event('invoice.payment_failed', 'failed-event', oct + 10, f.invoice('new', oct, nov));
    if (order === 'failed-first') { await f.process(failure); await f.process(f.paid); }
    else { await f.process(f.paid); await f.process(failure); }
    await Promise.all([f.process(f.paid), f.process(failure)]);
    const membership = await db.membership.findUniqueOrThrow({ where: { id: f.id }, include: { purchase: { include: { creditAccount: true } } } });
    expect(membership.status).toBe('ACTIVE');
    expect(membership.currentPeriodEnd).toEqual(new Date(nov * 1000));
    expect(membership.purchase?.creditAccount?.validUntil).toEqual(new Date(nov * 1000));
    expect(await db.paymentRecord.count({ where: { userId: f.id } })).toBe(1);
    expect((await db.paymentRecord.findUniqueOrThrow({ where: { stripeInvoiceId: `${f.id}-new` } })).status).toBe('SUCCEEDED');
  }, 20000);
  it.each(['CANCELLED', 'PAUSED', 'EXPIRED'] as const)('keeps explicit %s across later failure/payment and concurrent replays', async status => {
    const f = await fixture();
    await db.membership.update({ where: { id: f.id }, data: { status } });
    const failure = f.event('invoice.payment_failed', 'failed-event', oct + 5, f.invoice('new', oct, nov));
    await f.process(failure);
    expect((await db.membership.findUniqueOrThrow({ where: { id: f.id } })).status).toBe(status);
    await f.process(f.paid);
    await Promise.all([f.process(f.paid), f.process(failure)]);
    const membership = await db.membership.findUniqueOrThrow({ where: { id: f.id }, include: { purchase: { include: { creditAccount: true } } } });
    expect(membership.status).toBe(status);
    expect(membership.purchase?.creditAccount?.validUntil).toEqual(new Date(oct * 1000));
    expect((await db.paymentRecord.findUniqueOrThrow({ where: { stripeInvoiceId: `${f.id}-new` } })).status).toBe('SUCCEEDED');
  }, 20000);
});
