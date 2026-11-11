import { beforeAll, afterAll, beforeEach, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { discountDatabaseDeclaration, assertDiscountDatabaseIdentity } from '@/scripts/release/disposable-discount-database';
const declaration = discountDatabaseDeclaration(process.env);
const db = new PrismaClient({ datasourceUrl: declaration.url });
const f = vi.hoisted(() => ({
  auth: vi.fn(),
  create: vi.fn(),
  retrieve: vi.fn(),
  coupon: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({
  get prisma() {
    return db;
  },
}));
vi.mock('@/lib/auth/session', () => ({ requireArea: f.auth }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Error('REDIRECT:' + url);
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: vi.fn() }));
vi.mock('@/lib/payments/stripe', () => ({
  stripeIsConfigured: () => true,
  getStripe: () => ({
    coupons: { retrieve: f.coupon, create: vi.fn() },
    checkout: { sessions: { create: f.create, retrieve: f.retrieve } },
  }),
}));
import { startCheckoutAction } from '@/app/(portal)/member/membership/actions';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';
let product: any, waiver: any, campaign: any, user: any;
const sessions = new Map<string, any>();
const calls: any[] = [];
beforeAll(async () => {
 await assertDiscountDatabaseIdentity(db, declaration);
  product = await db.product.create({
    data: {
      slug: randomUUID(),
      name: 'Synthetic pack',
      description: 'Isolated verification',
      kind: 'CLASS_PACK',
      billingInterval: 'ONE_TIME',
      priceCents: 9200,
      includedCredits: 8,
      eligibleCategoryIds: [],
      isActive: true,
      isPublic: true,
    },
  });
  waiver = await db.waiverVersion.create({
    data: {
      version: -parseInt(randomUUID().slice(0, 7), 16),
      title: 'Synthetic',
      body: 'Synthetic',
      effectiveAt: new Date(),
      isActive: true,
    },
  });
  campaign = await db.discountCampaign.create({
    data: {
      code:
        'ACTION' + randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase(),
      percentOff: 15,
      startsAt: new Date(Date.now() - 60000),
      endsAt: new Date(Date.now() + 86400000),
      productIds: [product.id],
      enabled: true,
    },
  });
});
afterAll(() => db.$disconnect());
beforeEach(async () => {
  user = await db.user.create({
    data: { email: randomUUID() + '@example.invalid', status: 'ACTIVE' },
  });
  await db.waiverAcceptance.create({
    data: {
      userId: user.id,
      waiverVersionId: waiver.id,
      signedDate: new Date(),
    },
  });
  await db.discountCampaign.update({
    where: { id: campaign.id },
    data: {
      enabled: true,
      startsAt: new Date(Date.now() - 60000),
      endsAt: new Date(Date.now() + 86400000),
    },
  });
  f.auth.mockResolvedValue(user);
  f.create.mockReset();
  f.retrieve.mockReset();
  f.coupon.mockResolvedValue({
    id: 'coupon_synthetic',
    valid: true,
    percent_off: 15,
    duration: 'once',
  });
  sessions.clear();
  calls.length = 0;
  f.create.mockImplementation(async (params: any, options: any) => {
    calls.push({ params, options });
    if (!sessions.has(options.idempotencyKey))
      sessions.set(options.idempotencyKey, {
        id: 'cs_' + params.metadata.purchaseId,
        url: 'https://example.invalid/' + params.metadata.purchaseId,
        status: 'open',
      });
    return sessions.get(options.idempotencyKey);
  });
  f.retrieve.mockImplementation(async (id: string) =>
    [...sessions.values()].find((x) => x.id === id),
  );
});
async function invoke(code = campaign.code, selectedProduct = product.id) {
  const form = new FormData();
  form.set('productId', selectedProduct);
  form.set('referralCode', code);
  try {
    await startCheckoutAction(form);
    return 'RETURNED';
  } catch (e) {
    return String(e);
  }
}
async function purchase() {
  return db.purchase.findFirstOrThrow({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });
}
function event(p: any, type = 'checkout.session.completed') {
  return {
    id: 'evt_' + randomUUID(),
    livemode: false,
    type,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'cs_' + p.id,
        payment_status: 'paid',
        amount_total: 7820,
        currency: 'usd',
        payment_intent: 'pi_' + p.id,
        metadata: { purchaseId: p.id },
      },
    },
  } as any;
}
async function paid(p: any, type?: string) {
  await db.$transaction((tx) => processStripeEvent(tx, event(p, type)), {
    timeout: 15000,
  });
  const session = sessions.get('checkout-' + p.id);
  if (session) session.status = 'complete';
}
async function state(p: any) {
  return {
    purchase: await db.purchase.findUnique({ where: { id: p.id } }),
    payments: await db.paymentRecord.findMany({ where: { purchaseId: p.id } }),
    accounts: await db.creditAccount.findMany({
      where: { sourcePurchaseId: p.id },
      include: { entries: true },
    }),
  };
}

function reversal(p: any, kind: string) {
  return {
    id: 'evt_' + randomUUID(),
    livemode: false,
    type: kind === 'dispute' ? 'charge.dispute.created' : 'charge.refunded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'ch_' + p.id,
        payment_intent: 'pi_' + p.id,
        amount: 7820,
        amount_refunded: kind === 'partial' ? 2000 : 7820,
        refunded: kind === 'full',
      },
    },
  } as any;
}
const applyEvent = (e: any) =>
  db.$transaction((tx) => processStripeEvent(tx, e), { timeout: 15000 });
async function fixture() {
  expect(await invoke()).toContain('https://example.invalid/');
  const p = await purchase();
  await paid(p);
  return p;
}
async function unrelated() {
  const product = await db.product.create({
    data: {
      slug: randomUUID(),
      name: 'Unrelated monthly',
      description: 'Synthetic',
      kind: 'VIP',
      billingInterval: 'MONTHLY',
      priceCents: 9000,
      eligibleCategoryIds: [],
    },
  });
  const p = await db.purchase.create({
    data: {
      userId: user.id,
      productId: product.id,
      amountCents: 9000,
      status: 'PAID',
      paidAt: new Date(),
    },
  });
  await db.membership.create({
    data: {
      userId: user.id,
      productId: product.id,
      purchaseId: p.id,
      status: 'ACTIVE',
      currentPeriodStart: new Date(),
      stripeSubscriptionId: 'sub_' + p.id,
    },
  });
  return async () => ({
    ...(await state(p)),
    membership: await db.membership.findUnique({ where: { purchaseId: p.id } }),
  });
}
for (const kind of ['full', 'partial', 'dispute']) {
  it(`action paid ${kind} distinct success and identical replay preserve full financial/credit history`, async () => {
    const p = await fixture(),
      other = await unrelated(),
      otherBefore = await other(),
      before = await state(p);
    await applyEvent(reversal(p, kind));
    const reversed = await state(p);
    expect(reversed.purchase?.status).toBe(
      kind === 'dispute'
        ? 'FAILED'
        : kind === 'full'
          ? 'REFUNDED'
          : 'PARTIALLY_REFUNDED',
    );
    expect(reversed.payments[0].status).toBe(
      kind === 'dispute'
        ? 'DISPUTED'
        : kind === 'full'
          ? 'REFUNDED'
          : 'PARTIALLY_REFUNDED',
    );
    expect(reversed.accounts).toEqual(before.accounts);
    const late = event(p, 'checkout.session.async_payment_succeeded');
    late.created += 120;
    late.data.object.amount_total = 1234;
    await applyEvent(late);
    expect(await state(p)).toEqual(reversed);
    await applyEvent(late);
    await applyEvent(event(p));
    expect(await state(p)).toEqual(reversed);
    expect(await other()).toEqual(otherBefore);
  });
  for (const isolationLevel of ['ReadCommitted', 'Serializable'] as const)
    for (const first of ['success', 'reversal'])
      it(`${kind} ${isolationLevel} concurrent ${first} first serializes on Purchase before PaymentRecord`, async () => {
        const p = await fixture(),
          before = await state(p);
        let entered!: () => void, release!: () => void;
        const ready = new Promise<void>((r) => (entered = r)),
          gate = new Promise<void>((r) => (release = r));
        const success = event(p, 'checkout.session.async_payment_succeeded'),
          reverse = reversal(p, kind);
        let pid = 0;
        const a = db.$transaction(
          async (tx) => {
            await processStripeEvent(
              tx,
              first === 'success' ? success : reverse,
            );
            entered();
            await gate;
          },
          { timeout: 15000, isolationLevel },
        );
        await ready;
        const b = retrySerializableTransaction(() =>
          db.$transaction(
            async (tx) => {
              pid = Number(
                (
                  await tx.$queryRawUnsafe<any[]>('SELECT pg_backend_pid() pid')
                )[0].pid,
              );
              await processStripeEvent(
                tx,
                first === 'success' ? reverse : success,
              );
            },
            { timeout: 15000, isolationLevel },
          ),
        );
        let waiting: any;
        try {
          for (let i = 0; i < 200; i++) {
            if (pid) {
              const rows = await db.$queryRawUnsafe<any[]>(
                'SELECT wait_event_type,query FROM pg_stat_activity WHERE pid=$1',
                pid,
              );
              if (rows[0]?.wait_event_type === 'Lock') {
                waiting = rows[0];
                break;
              }
            }
            await new Promise((r) => setTimeout(r, 10));
          }
        } finally {
          release();
          await Promise.all([a, b]);
        }
        expect(waiting?.query).toContain('"Purchase"');
        const after = await state(p);
        expect(after.purchase?.status).toBe(
          kind === 'dispute'
            ? 'FAILED'
            : kind === 'full'
              ? 'REFUNDED'
              : 'PARTIALLY_REFUNDED',
        );
        expect(after.payments[0].status).toBe(
          kind === 'dispute'
            ? 'DISPUTED'
            : kind === 'full'
              ? 'REFUNDED'
              : 'PARTIALLY_REFUNDED',
        );
        expect(after.purchase?.amountCents).toBe(7820);
        expect(after.payments[0].amountCents).toBe(7820);
        expect(after.accounts).toEqual(before.accounts);
      });
}
it('never-paid FAILED recovers and grants exactly once', async () => {
  await invoke();
  const p = await purchase();
  await applyEvent(event(p, 'checkout.session.async_payment_failed'));
  expect((await state(p)).purchase?.paidAt).toBeNull();
  await paid(p, 'checkout.session.async_payment_succeeded');
  await paid(p);
  const s = await state(p);
  expect(s.purchase?.status).toBe('PAID');
  expect(s.payments[0].status).toBe('SUCCEEDED');
  expect(s.accounts).toHaveLength(1);
  expect(s.accounts[0].entries.map((x) => x.quantity)).toEqual([8]);
});
it('payment-only dispute evidence blocks pack resurrection even without Purchase failed marker', async () => {
  const p = await fixture();
  await db.paymentRecord.updateMany({
    where: { purchaseId: p.id },
    data: { status: 'DISPUTED' },
  });
  const before = await state(p);
  await paid(p);
  expect(await state(p)).toEqual(before);
});
it('invoice metadata for a class pack cannot mutate its refunded state', async () => {
  const p = await fixture();
  await applyEvent(reversal(p, 'full'));
  const before = await state(p);
  await applyEvent({
    id: 'evt_' + randomUUID(),
    livemode: false,
    type: 'invoice.paid',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'in_' + p.id,
        subscription: 'sub_' + p.id,
        metadata: { purchaseId: p.id },
        amount_paid: 7820,
        currency: 'usd',
      },
    },
  });
  expect(await state(p)).toEqual(before);
});
