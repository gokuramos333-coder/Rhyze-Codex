import { describe, expect, it, vi } from 'vitest';
import { linkStripeEventPayment, verifyExternalEventPayment } from '@/lib/admin/stripe-event-payment-linking';

const now = new Date('2026-09-29T01:00:00Z');
const input = { paymentIntentId: 'pi_external', userId: 'member', occurrenceId: 'event', amountCents: 3000, currency: 'usd' as const, markAttended: false, reason: 'Verified studio payment receipt', actorId: 'owner' };
function fixture() {
  const pi: any = { id: 'pi_external', livemode: true, status: 'succeeded', amount: 3000, amount_received: 3000, currency: 'usd', latest_charge: 'ch_external', customer: null, metadata: {} };
  const charge: any = { id: 'ch_external', payment_intent: pi.id, livemode: true, paid: true, captured: true, status: 'succeeded', amount: 3000, amount_captured: 3000, amount_refunded: 0, refunded: false, disputed: false, currency: 'usd', created: 1790625600, billing_details: { email: 'member@example.com', name: 'Member' }, customer: null, metadata: {}, receipt_url: 'https://pay.stripe.com/receipts/example' };
  const stripe: any = { paymentIntents: { retrieve: vi.fn(async () => pi) }, charges: { retrieve: vi.fn(async () => charge) }, refunds: { list: vi.fn(async () => ({ data: [], has_more: false })) }, disputes: { list: vi.fn(async () => ({ data: [], has_more: false })) }, checkout: { sessions: { list: vi.fn(async () => ({ data: [], has_more: false })) } }, invoicePayments: { list: vi.fn(async () => ({ data: [], has_more: false })) } };
  let order: any = null; let booking: any = null; let payment: any = null; let attendance: any = null;
  const tx: any = {
    $executeRaw: vi.fn(async () => 1),
    user: { findUnique: vi.fn(async () => ({ id: 'member', email: 'member@example.com', name: 'Member', status: 'ACTIVE', stripeCustomerId: null })), findFirst: vi.fn(async () => null) },
    classOccurrence: { findUnique: vi.fn(async () => ({ id: 'event', status: 'SCHEDULED', startAt: new Date('2026-09-28T23:15:00Z'), endAt: new Date('2026-09-29T00:15:00Z'), priceCents: 3000, capacity: 30, historicalSignupCount: 0, template: { name: 'Hip Hop', slug: 'hip-hop', isEvent: true, dropInPriceCents: 3000 } })) },
    purchase: { findFirst: vi.fn(async () => null) }, bookingTransfer: { findFirst: vi.fn(async () => null) }, sombleTransaction: { findFirst: vi.fn(async () => null) },
    commerceOrder: { findUnique: vi.fn(async () => order), findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }: any) => order = { id: 'order', refundedAmountCents: 0, ...data }) },
    commerceRefund: { findFirst: vi.fn(async () => null) },
    paymentRecord: { findMany: vi.fn(async () => payment ? [payment] : []), create: vi.fn(async ({ data }: any) => payment = { id: 'payment', refundedAmountCents: 0, ...data }), update: vi.fn(async ({ data }: any) => payment = { ...payment, ...data }) },
    booking: { findUnique: vi.fn(async () => booking), findFirst: vi.fn(async () => null), count: vi.fn(async () => 0), create: vi.fn(async ({ data }: any) => booking = { id: 'booking', ...data }), update: vi.fn(async ({ data }: any) => booking = { ...booking, ...data }) },
    attendanceRecord: { findUnique: vi.fn(async () => attendance), create: vi.fn(async ({ data }: any) => attendance = { id: 'attendance', ...data }), update: vi.fn(async ({ data }: any) => attendance = { ...attendance, ...data }) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const db: any = { $transaction: vi.fn(async (fn: any) => fn(tx)) };
  return { pi, charge, stripe, tx, db };
}

describe('verified external Stripe event reconciliation', () => {
  it('creates one paid event order, payment and booking without charging or consuming credits; retries reuse them', async () => {
    const f = fixture();
    const first = await linkStripeEventPayment(f.db, f.stripe, input, now);
    expect(first).toMatchObject({ orderId: 'order', bookingId: 'booking', paymentRecordId: 'payment', attended: false });
    expect(f.tx.commerceOrder.create.mock.calls[0][0].data).toMatchObject({ kind: 'EVENT', status: 'PAID', amountCents: 3000, stripePaymentIntentId: input.paymentIntentId });
    expect(f.tx.booking.create.mock.calls[0][0].data).toMatchObject({ source: 'STRIPE_EVENT', status: 'CONFIRMED' });
    expect(f.tx.paymentRecord.create.mock.calls[0][0].data).toMatchObject({ commerceOrderId: 'order', bookingId: 'booking', kind: 'EVENT', status: 'SUCCEEDED' });
    expect(f.tx.attendanceRecord.create).not.toHaveBeenCalled();
    await linkStripeEventPayment(f.db, f.stripe, input, now);
    expect(f.tx.commerceOrder.create).toHaveBeenCalledTimes(1);
    expect(f.tx.booking.create).toHaveBeenCalledTimes(1);
    expect(f.tx.paymentRecord.create).toHaveBeenCalledTimes(1);
  });
  it('marks historical attendance only with explicit owner input and never resets it on a retry', async () => {
    const f = fixture();
    await linkStripeEventPayment(f.db, f.stripe, { ...input, markAttended: true }, now);
    expect(f.tx.attendanceRecord.create.mock.calls[0][0].data).toMatchObject({ status: 'ATTENDED', markedById: 'owner', userId: 'member', occurrenceId: 'event', bookingId: 'booking' });
    await linkStripeEventPayment(f.db, f.stripe, input, now);
    expect(f.tx.booking.update).not.toHaveBeenCalled();
  });
  it.each([
    ['test mode', (f: any) => f.pi.livemode = false],
    ['unpaid', (f: any) => f.pi.status = 'processing'],
    ['uncaptured', (f: any) => f.charge.captured = false],
    ['partial amount', (f: any) => f.pi.amount_received = 2000],
    ['different currency', (f: any) => f.charge.currency = 'eur'],
    ['refunded', (f: any) => f.charge.amount_refunded = 100],
    ['disputed', (f: any) => f.charge.disputed = true],
    ['pending refund', (f: any) => f.stripe.refunds.list.mockResolvedValue({ data: [{ status: 'pending' }], has_more: false })],
    ['existing invoice', (f: any) => f.stripe.invoicePayments.list.mockResolvedValue({ data: [{ id: 'ip_existing' }], has_more: false })],
    ['purchase metadata', (f: any) => f.pi.metadata.purchaseId = 'other'],
  ])('rejects %s before local writes', async (_name, mutate) => {
    const f = fixture(); mutate(f);
    await expect(linkStripeEventPayment(f.db, f.stripe, input, now)).rejects.toThrow();
    expect(f.db.$transaction).not.toHaveBeenCalled();
  });
  it.each([
    ['full event', (f: any) => f.tx.booking.count.mockResolvedValue(30)],
    ['existing booking', (f: any) => f.tx.booking.findUnique.mockResolvedValue({ id: 'existing', source: 'MEMBER', status: 'CONFIRMED' })],
    ['existing purchase', (f: any) => f.tx.purchase.findFirst.mockResolvedValue({ id: 'purchase' })],
    ['existing other event order', (f: any) => f.tx.commerceOrder.findUnique.mockResolvedValue({ id: 'order', kind: 'EVENT', status: 'PAID', userId: 'member', occurrenceId: 'different' })],
    ['other paid order for event', (f: any) => f.tx.commerceOrder.findFirst.mockResolvedValue({ id: 'other-order' })],
    ['cancelled event', (f: any) => f.tx.classOccurrence.findUnique.mockResolvedValue({ status: 'CANCELLED', template: { isEvent: true } })],
    ['overlapping booking', (f: any) => f.tx.booking.findFirst.mockResolvedValue({ id: 'overlap' })],
    ['unrelated attendance', (f: any) => f.tx.attendanceRecord.findUnique.mockResolvedValue({ id: 'attendance', bookingId: 'unrelated', status: 'ATTENDED' })],
    ['wrong payer', (f: any) => f.charge.billing_details.email = 'other@example.com'],
    ['wrong event amount', (f: any) => f.tx.classOccurrence.findUnique.mockResolvedValue({ id: 'event', status: 'SCHEDULED', priceCents: 3500, template: { isEvent: true } })],
    ['other payment owner', (f: any) => f.tx.paymentRecord.findMany.mockResolvedValue([{ id: 'payment', userId: 'other', status: 'SUCCEEDED', amountCents: 3000, currency: 'usd', refundedAmountCents: 0 }])],
  ])('rejects %s without creating an order', async (_name, mutate) => {
    const f = fixture(); mutate(f);
    await expect(linkStripeEventPayment(f.db, f.stripe, input, now)).rejects.toThrow();
    expect(f.tx.commerceOrder.create).not.toHaveBeenCalled();
  });
  it('links an already imported unmatched studio payment without duplicating the ledger', async () => {
    const f = fixture();
    f.tx.paymentRecord.findMany.mockResolvedValue([{ id: 'existing-payment', kind: 'PRODUCT_PURCHASE', status: 'SUCCEEDED', amountCents: 3000, refundedAmountCents: 0, currency: 'usd', stripePaymentIntentId: input.paymentIntentId }]);
    const result = await linkStripeEventPayment(f.db, f.stripe, input, now);
    expect(result.orderId).toBe('order');
    expect(f.tx.paymentRecord.create).not.toHaveBeenCalled();
    expect(f.tx.paymentRecord.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'existing-payment' }, data: expect.objectContaining({ commerceOrderId: 'order', bookingId: 'booking', userId: 'member' }) }));
  });
  it('refuses to mark attendance for a future event', async () => {
    const f = fixture();
    await expect(linkStripeEventPayment(f.db, f.stripe, { ...input, markAttended: true }, new Date('2026-09-01T00:00:00Z'))).rejects.toThrow('future');
    expect(f.tx.commerceOrder.create).not.toHaveBeenCalled();
  });
  it('retries a real PostgreSQL serialization SQLSTATE wrapped by Prisma raw-query errors', async () => {
    const f = fixture();
    f.db.$transaction.mockRejectedValueOnce({ code: 'P2010', meta: { code: '40001' } });
    await expect(linkStripeEventPayment(f.db, f.stripe, input, now)).resolves.toMatchObject({ orderId: 'order' });
    expect(f.db.$transaction).toHaveBeenCalledTimes(2);
  });
  it('does not retry unrelated raw query errors', async () => {
    const f = fixture(); const error = { code: 'P2010', meta: { code: '23505' } };
    f.db.$transaction.mockRejectedValue(error);
    await expect(linkStripeEventPayment(f.db, f.stripe, input, now)).rejects.toBe(error);
    expect(f.db.$transaction).toHaveBeenCalledTimes(1);
  });
  it('retrieves the actual charge and independently checks refunds and disputes', async () => {
    const f = fixture();
    await verifyExternalEventPayment(f.stripe, input);
    expect(f.stripe.charges.retrieve).toHaveBeenCalledWith('ch_external');
    expect(f.stripe.refunds.list).toHaveBeenCalledWith({ payment_intent: 'pi_external', limit: 100 });
    expect(f.stripe.disputes.list).toHaveBeenCalledWith({ charge: 'ch_external', limit: 1 });
  });
});
