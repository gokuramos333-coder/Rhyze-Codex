import { describe, expect, it, vi } from 'vitest';
import { classTicketPurchaseId, startClassTicketCheckout } from '@/lib/payments/class-ticket-checkout';
function fixture() {
  const occurrence = { id: 'soul-oct16', status: 'SCHEDULED', startAt: new Date('2026-10-16T23:30:00Z'), endAt: new Date('2026-10-17T00:20:00Z'), capacity: 30, historicalSignupCount: 0, priceCents: 1500, template: { name: 'Soul Line', slug: 'soul-line', isEvent: false } };
  const product = { id: 'standard-drop-in', name: 'Single Class', kind: 'DROP_IN', billingInterval: 'ONE_TIME', priceCents: 2500, includedCredits: 1, isUnlimited: false };
  let stored: any = null;
  let transaction = Promise.resolve();
  const db: any = { classOccurrence: { findUnique: vi.fn(async () => occurrence) }, product: { findFirst: vi.fn(async () => product) }, user: { findUnique: vi.fn(async () => ({ id: 'member', status: 'ACTIVE', email: 'member@example.test', name: 'Member', stripeCustomerId: null })) }, booking: { findUnique: vi.fn(async () => null), count: vi.fn(async () => 0) }, waiverVersion: { findFirst: vi.fn(async () => ({ id: 'waiver' })) }, waiverAcceptance: { findUnique: vi.fn(async () => ({ id: 'acceptance' })) }, purchase: { findUnique: vi.fn(async () => stored), findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }) => (stored = { status: 'PENDING', ...data })), update: vi.fn(async ({ data }) => (stored = { ...stored, ...data })) } };
  db.$executeRaw = vi.fn();
  db.$transaction = vi.fn((callback) => { const next = transaction.then(() => callback(db)); transaction = next.catch(() => {}); return next; });
  const stripe: any = { checkout: { sessions: { retrieve: vi.fn(async () => ({ id: 'cs_class', status: 'open', url: 'https://checkout.stripe.com/class' })), create: vi.fn(async () => ({ id: 'cs_class', url: 'https://checkout.stripe.com/class' })) } } };
  return { occurrence, product, db, stripe };
}
const input = { userId: 'member', occurrenceId: 'soul-oct16', origin: 'https://rhyzefitness.com' };
const now = new Date('2026-09-28T12:00:00Z');
describe('occurrence-specific class Checkout', () => {
  it('charges the server-owned $15 occurrence amount and scopes the $25 catalog product credit to this class', async () => {
    const f = fixture();
    await expect(startClassTicketCheckout(f.db, f.stripe, input, now)).resolves.toBe('https://checkout.stripe.com/class');
    expect(f.db.purchase.create).toHaveBeenCalledWith({ data: expect.objectContaining({ productId: 'standard-drop-in', amountCents: 1500, policyAcceptance: expect.objectContaining({ classTicket: { occurrenceId: 'soul-oct16', name: 'Soul Line', startAt: f.occurrence.startAt.toISOString(), endAt: f.occurrence.endAt.toISOString(), amountCents: 1500 } }) }) });
    expect(f.stripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ mode: 'payment', wallet_options: { link: { display: 'never' } }, line_items: [expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 1500, currency: 'usd' }) })], metadata: expect.objectContaining({ purchaseId: classTicketPurchaseId('member', 'soul-oct16'), userId: 'member', occurrenceId: 'soul-oct16' }) }), { idempotencyKey: `${classTicketPurchaseId('member', 'soul-oct16')}:checkout:1` });
  });
  it('reuses an open session on repeated requests', async () => {
    const f = fixture();
    await startClassTicketCheckout(f.db, f.stripe, input, now);
    await startClassTicketCheckout(f.db, f.stripe, input, now);
    expect(f.db.purchase.create).toHaveBeenCalledTimes(1);
    expect(f.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
    expect(f.stripe.checkout.sessions.retrieve).toHaveBeenCalledWith('cs_class');
  });
  it('concurrent requests share one purchase and exact provider idempotency key', async () => {
    const f = fixture();
    await Promise.all([startClassTicketCheckout(f.db, f.stripe, input, now), startClassTicketCheckout(f.db, f.stripe, input, now)]);
    expect(f.db.purchase.create).toHaveBeenCalledTimes(1);
    const calls = f.stripe.checkout.sessions.create.mock.calls;
    expect(new Set(calls.map((call: any) => JSON.stringify(call)))).toHaveProperty('size', 1);
  });
  it('preserves ambiguous provider attempts and retries the identical request even after catalog edits', async () => {
    const f = fixture();
    f.stripe.checkout.sessions.create.mockRejectedValueOnce(new Error('network timeout'));
    await expect(startClassTicketCheckout(f.db, f.stripe, input, now)).rejects.toThrow('network timeout');
    f.occurrence.priceCents = 1700;
    await startClassTicketCheckout(f.db, f.stripe, input, now);
    expect(f.db.purchase.create).toHaveBeenCalledTimes(1);
    expect(f.stripe.checkout.sessions.create.mock.calls[1]).toEqual(f.stripe.checkout.sessions.create.mock.calls[0]);
    expect(f.db.purchase.update.mock.calls.every((call: any) => call[0].data.status !== 'FAILED')).toBe(true);
  });
  it('requires review when an unknown provider result outlives safe idempotency retention', async () => {
    const f = fixture();
    f.stripe.checkout.sessions.create.mockRejectedValueOnce(new Error('network timeout'));
    await expect(startClassTicketCheckout(f.db, f.stripe, input, now)).rejects.toThrow();
    await expect(startClassTicketCheckout(f.db, f.stripe, input, new Date(now.getTime() + 24 * 3600000))).rejects.toThrow('older payment attempt');
    expect(f.stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });
  it('rotates only an actually expired session, retaining the single purchase', async () => {
    const f = fixture();
    await startClassTicketCheckout(f.db, f.stripe, input, now);
    f.stripe.checkout.sessions.retrieve.mockResolvedValueOnce({ id: 'cs_class', status: 'expired' });
    await startClassTicketCheckout(f.db, f.stripe, input, now);
    expect(f.db.purchase.create).toHaveBeenCalledTimes(1);
    expect(f.stripe.checkout.sessions.create.mock.calls[1][1]).toEqual({ idempotencyKey: `${classTicketPurchaseId('member', 'soul-oct16')}:checkout:2` });
  });
  it.each([
    ['waiver missing', (f: any) => f.db.waiverAcceptance.findUnique.mockResolvedValue(null)],
    ['class full', (f: any) => f.db.booking.count.mockResolvedValue(30)],
    ['already booked', (f: any) => f.db.booking.findUnique.mockResolvedValue({ status: 'CONFIRMED' })],
    ['already purchased', (f: any) => f.db.purchase.findFirst.mockResolvedValue({ id: 'existing' })],
    ['event', (f: any) => f.occurrence.template.isEvent = true],
    ['past class', (f: any) => f.occurrence.startAt = new Date('2026-01-01')],
    ['missing override', (f: any) => f.occurrence.priceCents = null],
  ])('rejects %s before creating a purchase or Stripe session', async (_name, mutate) => {
    const f = fixture(); mutate(f);
    await expect(startClassTicketCheckout(f.db, f.stripe, input, now)).rejects.toThrow();
    expect(f.db.purchase.create).not.toHaveBeenCalled();
    expect(f.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
