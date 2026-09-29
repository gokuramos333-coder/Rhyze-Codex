import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { checkoutReturnEvent } from '@/lib/payments/checkout-return-event';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { standardSingleClassCreditCanBook } from '@/lib/domain/bookings/booking-rules';
import { startClassTicketCheckout } from '@/lib/payments/class-ticket-checkout';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: vi.fn() }));
const url = process.env.CALLBACK_TEST_DATABASE_URL;
if (url && (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname) || new URL(url).pathname !== '/callback_test')) throw new Error('Class ticket tests require disposable local callback_test');
describe.skipIf(!url)('occurrence-bound class payment fulfillment on PostgreSQL', () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const prefix = `class-ticket-${randomUUID()}`;
  const product = `${prefix}-product`;
  const now = new Date('2026-09-28T12:00Z');
  const memberWhere = { startsWith: `${prefix}-member-` };
  beforeAll(async () => {
    await db.product.create({ data: { id: product, slug: product, name: 'Single class', description: 'Synthetic standard drop-in', kind: 'DROP_IN', billingInterval: 'ONE_TIME', priceCents: 2500, includedCredits: 1, isActive: true, isPublic: true, displayOrder: -999999, eligibleCategoryIds: [] } });
    await db.classCategory.create({ data: { id: prefix, name: prefix, slug: prefix } });
    await db.classTemplate.create({ data: { id: prefix, categoryId: prefix, name: 'Synthetic Soul Line', slug: prefix, description: 'Integration fixture', durationMinutes: 50, defaultCapacity: 5, dropInPriceCents: 2500, isEvent: false, tags: [], equipment: [] } });
    await db.waiverVersion.create({ data: { id: prefix, version: Math.floor(Math.random() * 1000000000), title: 'Synthetic waiver', body: 'Test', effectiveAt: new Date('2098-01-01'), isActive: true, requiresSign: true } });
  });
  async function fixture(label: string, pending = true) {
    const member = `${prefix}-member-${label}`;
    const purchase = `${prefix}-purchase-${label}`;
    const ticket = { occurrenceId: `${prefix}-occurrence-${label}`, name: 'Synthetic Soul Line', startAt: '2099-10-16T23:30:00.000Z', endAt: '2099-10-17T00:20:00.000Z', amountCents: 1500 };
    await db.user.create({ data: { id: member, email: `${member}@example.test`, status: 'ACTIVE' } });
    await db.waiverAcceptance.create({ data: { userId: member, waiverVersionId: prefix, signedDate: now } });
    await db.classOccurrence.create({ data: { id: ticket.occurrenceId, templateId: prefix, startAt: new Date(ticket.startAt), endAt: new Date(ticket.endAt), capacity: 5, priceCents: 1500 } });
    await db.creditAccount.create({ data: { id: `${member}-unrelated`, userId: member, label: 'Unrelated existing credits', entries: { create: { type: 'GRANT', quantity: 3 } } } });
    if (pending) await db.purchase.create({ data: { id: purchase, userId: member, productId: product, amountCents: 1500, policyAcceptance: { classTicket: ticket } } });
    const event = (amount = 1500) => ({ id: `${purchase}-event`, type: 'checkout.session.completed', livemode: true, created: now.getTime() / 1000, data: { object: { id: `${purchase}-session`, mode: 'payment', payment_status: 'paid', amount_total: amount, currency: 'usd', payment_intent: `${purchase}-pi`, metadata: { purchaseId: purchase, userId: member } } } }) as unknown as Stripe.Event;
    const fulfill = (amount = 1500) => retrySerializableTransaction(() => db.$transaction((tx) => processStripeEvent(tx, event(amount)), { isolationLevel: 'Serializable' }));
    return { member, purchase, ticket, event, fulfill };
  }
  async function unchangedUnrelated(member: string) {
    expect(await db.creditLedgerEntry.findMany({ where: { creditAccountId: `${member}-unrelated` } })).toMatchObject([{ type: 'GRANT', quantity: 3, bookingId: null }]);
    expect(await db.attendanceRecord.count({ where: { userId: member } })).toBe(0);
  }
  afterAll(async () => {
    await db.auditLog.deleteMany({ where: { entityId: { startsWith: prefix } } });
    await db.paymentRecord.deleteMany({ where: { userId: memberWhere } });
    await db.creditLedgerEntry.deleteMany({ where: { creditAccount: { userId: memberWhere } } });
    await db.creditAccount.deleteMany({ where: { userId: memberWhere } });
    await db.booking.deleteMany({ where: { userId: memberWhere } });
    await db.purchase.deleteMany({ where: { userId: memberWhere } });
    await db.waiverAcceptance.deleteMany({ where: { waiverVersionId: prefix } });
    await db.waiverVersion.deleteMany({ where: { id: prefix } });
    await db.user.deleteMany({ where: { id: memberWhere } });
    await db.classOccurrence.deleteMany({ where: { templateId: prefix } });
    await db.classTemplate.deleteMany({ where: { id: prefix } });
    await db.classCategory.deleteMany({ where: { id: prefix } });
    await db.product.deleteMany({ where: { id: product } });
    await db.$disconnect();
  });
  it('fulfills concurrent/repeated $15 receipts once, booking only the purchased class against the unchanged $25 catalog', async () => {
    const f = await fixture('paid');
    await expect(f.fulfill(2500)).rejects.toThrow('does not match');
    expect(await db.creditAccount.count({ where: { sourcePurchaseId: f.purchase } })).toBe(0);
    expect(await db.paymentRecord.count({ where: { userId: f.member } })).toBe(0);
    await Promise.all([f.fulfill(), f.fulfill()]);
    await f.fulfill();
    const paid = await db.purchase.findUniqueOrThrow({ where: { id: f.purchase }, include: { creditAccount: { include: { entries: true } } } });
    expect(paid).toMatchObject({ amountCents: 1500, status: 'PAID', policyAcceptance: { classTicket: f.ticket, classTicketFulfillment: { status: 'BOOKED' } } });
    expect(paid.creditAccount?.validUntil).toEqual(new Date(f.ticket.endAt));
    expect(paid.creditAccount?.entries).toHaveLength(2);
    expect(paid.creditAccount?.entries.reduce((sum, entry) => sum + entry.quantity, 0)).toBe(0);
    expect(await db.booking.findMany({ where: { userId: f.member } })).toMatchObject([{ occurrenceId: f.ticket.occurrenceId, status: 'CONFIRMED', source: 'CLASS_TICKET' }]);
    expect(await db.paymentRecord.findMany({ where: { userId: f.member } })).toMatchObject([{ amountCents: 1500, purchaseId: f.purchase }]);
    expect(await db.product.findUniqueOrThrow({ where: { id: product } })).toMatchObject({ priceCents: 2500 });
    const eligibility = { productKind: 'DROP_IN', paidAt: paid.paidAt, purchaseStatus: paid.status, purchasePolicy: paid.policyAcceptance, occurrenceStartsAt: new Date(f.ticket.startAt), isEvent: false, validUntil: paid.creditAccount?.validUntil };
    expect(standardSingleClassCreditCanBook({ ...eligibility, occurrenceId: f.ticket.occurrenceId })).toBe(true);
    expect(standardSingleClassCreditCanBook({ ...eligibility, occurrenceId: 'another-more-expensive-class' })).toBe(false);
    await unchangedUnrelated(f.member);
  });
  it('records October payment when the first callback precedes the webhook for a session opened in September', async () => {
    const f = await fixture('first-callback');
    const paidAt = Date.parse('2026-10-01T10:00Z') / 1000;
    const checkout = { ...f.event().data.object, id: `${f.purchase}-session`, status: 'complete', created: Date.parse('2026-09-30T22:00Z') / 1000, livemode: true } as Stripe.Checkout.Session;
    const stripe = { paymentIntents: { retrieve: async () => ({ status: 'succeeded', livemode: true, latest_charge: 'ch_callback' }) }, charges: { retrieve: async () => ({ payment_intent: `${f.purchase}-pi`, livemode: true, paid: true, captured: true, disputed: false, amount_refunded: 0, currency: 'usd', amount_captured: 1500, created: paidAt, balance_transaction: { created: paidAt } }) } } as unknown as Stripe;
    const callback = await checkoutReturnEvent(stripe, checkout);
    await db.$transaction((tx) => processStripeEvent(tx, callback));
    const webhook = f.event(); webhook.created = paidAt + 2;
    await db.$transaction((tx) => processStripeEvent(tx, webhook));
    expect(await db.purchase.findUniqueOrThrow({ where: { id: f.purchase } })).toMatchObject({ paidAt: new Date(paidAt * 1000) });
    expect(await db.paymentRecord.findFirst({ where: { purchaseId: f.purchase } })).toMatchObject({ occurredAt: new Date(paidAt * 1000) });
    expect(await db.booking.count({ where: { userId: f.member } })).toBe(1);
  });
  it('preserves the paid webhook time when success-return replays an older session creation timestamp', async () => {
    const f = await fixture('payment-date');
    await f.fulfill();
    const previous = await db.purchase.findUniqueOrThrow({ where: { id: f.purchase } });
    const older = f.event(); older.created -= 86400;
    await db.$transaction((tx) => processStripeEvent(tx, older));
    expect(await db.purchase.findUniqueOrThrow({ where: { id: f.purchase } })).toEqual(previous);
    expect(await db.paymentRecord.findFirst({ where: { purchaseId: f.purchase } })).toMatchObject({ occurredAt: now });
  });
  it.each(['full', 'cancelled', 'past'])('preserves late %s payments for audited review without consuming other credits or promising a seat', async (state) => {
    const f = await fixture(state);
    await db.classOccurrence.update({ where: { id: f.ticket.occurrenceId }, data: state === 'full' ? { historicalSignupCount: 5 } : state === 'cancelled' ? { status: 'CANCELLED' } : { startAt: new Date('2020-01-01'), endAt: new Date('2020-01-01T00:50Z') } });
    await f.fulfill(); await f.fulfill();
    const paid = await db.purchase.findUniqueOrThrow({ where: { id: f.purchase }, include: { creditAccount: { include: { entries: true } } } });
    expect(paid).toMatchObject({ status: 'PAID', amountCents: 1500, policyAcceptance: { classTicketFulfillment: { status: 'REVIEW' } }, creditAccount: { validUntil: null } });
    expect(paid.creditAccount?.entries).toMatchObject([{ type: 'GRANT', quantity: 1 }]);
    expect(await db.booking.count({ where: { userId: f.member } })).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: f.purchase, action: 'class-ticket.fulfillment-review' } })).toBe(1);
    expect(standardSingleClassCreditCanBook({ productKind: 'DROP_IN', paidAt: paid.paidAt, purchaseStatus: paid.status, purchasePolicy: paid.policyAcceptance, occurrenceId: f.ticket.occurrenceId, occurrenceStartsAt: new Date(f.ticket.startAt), isEvent: false, validUntil: null })).toBe(false);
    await unchangedUnrelated(f.member);
  });
  it('rolls back booking, grant, payment and audit when fulfillment fails before commit', async () => {
    const f = await fixture('rollback');
    await expect(db.$transaction(async (tx) => { await processStripeEvent(tx, f.event()); throw new Error('injected commit failure'); })).rejects.toThrow('injected commit failure');
    expect(await db.purchase.findUniqueOrThrow({ where: { id: f.purchase } })).toMatchObject({ status: 'PENDING' });
    expect(await db.creditAccount.count({ where: { sourcePurchaseId: f.purchase } })).toBe(0);
    expect(await db.paymentRecord.count({ where: { userId: f.member } })).toBe(0);
    expect(await db.booking.count({ where: { userId: f.member } })).toBe(0);
    expect(await db.auditLog.count({ where: { entityId: f.purchase } })).toBe(0);
    await unchangedUnrelated(f.member);
  });
  it.each(['refund', 'dispute'])('does not revive a settled ticket after %s when success-return replays its receipt', async (reversal) => {
    const f = await fixture(reversal);
    await f.fulfill();
    const event = { id: `${f.purchase}-${reversal}`, type: reversal === 'refund' ? 'charge.refunded' : 'charge.dispute.created', data: { object: { payment_intent: `${f.purchase}-pi`, amount: 1500, amount_refunded: 1500, refunded: true } } } as unknown as Stripe.Event;
    await db.$transaction((tx) => processStripeEvent(tx, event));
    const before = await db.purchase.findUniqueOrThrow({ where: { id: f.purchase } });
    await f.fulfill();
    expect(await db.purchase.findUniqueOrThrow({ where: { id: f.purchase } })).toEqual(before);
    expect(await db.paymentRecord.findFirst({ where: { purchaseId: f.purchase } })).toMatchObject({ status: reversal === 'refund' ? 'REFUNDED' : 'DISPUTED' });
    expect(await db.creditLedgerEntry.count({ where: { creditAccount: { sourcePurchaseId: f.purchase } } })).toBe(2);
    await unchangedUnrelated(f.member);
  });
  it('concurrent checkout requests persist one purchase and share provider idempotency, including ambiguous retry', async () => {
    const f = await fixture('checkout', false);
    const sessions = new Map<string, { id: string; url: string }>();
    let failOnce = true;
    const stripe = { checkout: { sessions: {
      create: vi.fn(async (_parameters, options) => { const key = options.idempotencyKey; if (!sessions.has(key)) sessions.set(key, { id: `${prefix}-checkout-session`, url: 'https://checkout.stripe.com/synthetic' }); if (failOnce) { failOnce = false; throw new Error('ambiguous network failure'); } return sessions.get(key); }),
      retrieve: vi.fn(async () => ({ id: `${prefix}-checkout-session`, status: 'open', url: 'https://checkout.stripe.com/synthetic' })),
    } } } as unknown as Stripe;
    const input = { userId: f.member, occurrenceId: f.ticket.occurrenceId, origin: 'https://rhyze.example.test' };
    await Promise.allSettled([startClassTicketCheckout(db, stripe, input, now), startClassTicketCheckout(db, stripe, input, now)]);
    await expect(startClassTicketCheckout(db, stripe, input, now)).resolves.toBe('https://checkout.stripe.com/synthetic');
    expect(sessions.size).toBe(1);
    expect(await db.purchase.count({ where: { userId: f.member } })).toBe(1);
    expect(await db.purchase.findFirst({ where: { userId: f.member } })).toMatchObject({ status: 'PENDING', amountCents: 1500, stripeCheckoutSessionId: `${prefix}-checkout-session` });
    expect(await db.booking.count({ where: { userId: f.member } })).toBe(0);
    await unchangedUnrelated(f.member);
  });
});
