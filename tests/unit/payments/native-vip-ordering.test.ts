import { queueEmail } from '@/lib/notifications/email-queue';
import type Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { vipMembershipPaidThrough } from '@/lib/domain/credits/vip-access';
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: vi.fn() }));

const sep = Date.parse('2026-09-03T16:00Z') / 1000;
const oct = Date.parse('2026-10-03T16:00Z') / 1000;
const nov = Date.parse('2026-11-03T16:00Z') / 1000;
function fixture() {
  const account: any = { id: 'credits', isUnlimited: true, validFrom: new Date(sep * 1000), validUntil: new Date(oct * 1000), entries: [] };
  const product = { id: 'product', name: 'VIP', kind: 'VIP', billingInterval: 'MONTHLY', isUnlimited: true, includedCredits: null };
  const user = { id: 'user', name: 'Test', email: 'test@example.test' };
  const purchase: any = { id: 'purchase', userId: 'user', productId: 'product', status: 'PAID', paidAt: new Date(sep * 1000), product, user,
    policyAcceptance: { termsAccepted: true }, creditAccount: account };
  const membership: any = { id: 'membership', userId: 'user', purchaseId: 'purchase', productId: 'product', stripeSubscriptionId: 'sub',
    status: 'ACTIVE', currentPeriodStart: new Date(sep * 1000), currentPeriodEnd: new Date(oct * 1000), purchase, user, product };
  const records = new Map<string, any>();
  const tx: any = {
    $queryRaw: vi.fn(async () => [{ id: 'purchase' }]),
    membership: { findUnique: async () => membership, update: async ({ data }: any) => Object.assign(membership, data),
      updateMany: async ({ data }: any) => Object.assign(membership, data), upsert: async ({ update }: any) => Object.assign(membership, update) },
    purchase: { findUnique: async () => purchase, update: async ({ data }: any) => Object.assign(purchase, data) },
    // These ordering fixtures already have the calendar-month event benefit.
    // Real creation/deduplication is covered by native-vip-ordering integration tests.
    creditAccount: { findFirst: async () => ({ id: 'existing-monthly-event-benefit' }), findUnique: async () => account, upsert: vi.fn(async ({ update }: any) => Object.assign(account, update)) },
    paymentRecord: { findUnique: async ({ where }: any) => records.get(where.stripeInvoiceId) ?? null,
      upsert: async ({ where, create, update }: any) => { const value = records.get(where.stripeInvoiceId); records.set(where.stripeInvoiceId, value ? { ...value, ...update } : create); } },
    inAppNotification: { create: vi.fn() }, user: { update: vi.fn(), findMany: async () => [] },
  };
  const event = (type: string, at: number, object: any) => ({ id: `evt_${type}_${at}`, type, created: at, data: { object } }) as Stripe.Event;
  const invoice = (id: string, start: number, end: number, paidAt = start) => ({ id, subscription: 'sub', status: 'paid', amount_paid: 22200,
    amount_due: 22200, currency: 'usd', lines: { data: [{ type: 'subscription', period: { start, end } }] }, status_transitions: { paid_at: paidAt } });
  const run = (type: string, at: number, object: any) => processStripeEvent(tx, event(type, at, object));
  return { tx, purchase, membership, account, records, invoice, run };
}
describe('native VIP ordered paid entitlement, independent from invoice accounting', () => {
  it('notifies an unpaid VIP even when a newer lifecycle event arrived first', async () => {
    const f = fixture();
    await f.run('customer.subscription.updated', oct + 20, {
      id: 'sub', status: 'past_due', current_period_start: oct, current_period_end: nov,
    });
    vi.mocked(queueEmail).mockClear();
    await f.run('invoice.payment_failed', oct + 10, {
      ...f.invoice('reordered', oct, nov), status: 'open', amount_paid: 0,
    });
    expect(queueEmail).toHaveBeenCalledWith(f.tx, expect.objectContaining({
      template: 'PAYMENT_FAILED', dedupeKey: 'payment-failed:reordered',
    }));
  });
  it('does not notify a settled non-VIP invoice from a stale open failure snapshot', async () => {
    const f = fixture();
    f.membership.product.kind = 'LIMITED_MEMBERSHIP';
    f.records.set('already-paid', { status: 'SUCCEEDED' });
    vi.mocked(queueEmail).mockClear();
    await f.run('invoice.payment_failed', oct + 10, {
      ...f.invoice('already-paid', oct, nov), status: 'open', amount_paid: 0,
    });
    expect(queueEmail).not.toHaveBeenCalled();
    expect(f.records.get('already-paid').status).toBe('SUCCEEDED');
    expect(f.membership.status).toBe('ACTIVE');
  });

  it('queues the common billing notice for an unpaid native VIP renewal', async () => {
    const f = fixture();
    vi.mocked(queueEmail).mockClear();
    await f.run('invoice.payment_failed', oct + 10, {
      ...f.invoice('unpaid', oct, nov), status: 'open', amount_paid: 0,
      status_transitions: { paid_at: null },
    });
    expect(queueEmail).toHaveBeenCalledWith(f.tx, expect.objectContaining({
      template: 'PAYMENT_FAILED', dedupeKey: 'payment-failed:unpaid',
    }));
  });

  it.each(['failed-first', 'paid-first'])('settled payment wins a same-second dunning tie (%s), once across replays', async order => {
    const f = fixture();
    const at = oct + 10;
    const invoice = f.invoice('tied', oct, nov, at);
    const failure = () => f.run('invoice.payment_failed', at, invoice);
    const paid = () => f.run('invoice.paid', at, invoice);
    if (order === 'failed-first') { await failure(); await paid(); } else { await paid(); await failure(); }
    await paid(); await failure();
    expect(f.membership.status).toBe('ACTIVE');
    expect(vipMembershipPaidThrough(f.membership, new Date((at + 1) * 1000))).toEqual(new Date(nov * 1000));
    expect(f.tx.creditAccount.upsert).toHaveBeenCalledTimes(1);
    expect(f.records.size).toBe(1);
    expect(f.records.get('tied').status).toBe('SUCCEEDED');
  });
  describe.each(['CANCELLED', 'PAUSED', 'EXPIRED'])('explicit %s restriction', status => {
    it.each(['direct-paid', 'failed-then-paid'])('survives %s arrears and duplicate deliveries while recording payment history', async order => {
      const f = fixture(); f.membership.status = status;
      if (order === 'failed-then-paid') {
        await f.run('invoice.payment_failed', oct + 10, f.invoice('arrears', oct, nov));
        expect(f.records.get('arrears').status).toBe('FAILED');
        expect(f.membership.status).toBe(status);
      }
      const paid = f.invoice('arrears', oct, nov, oct + 20);
      await f.run('invoice.paid', oct + 20, paid);
      await f.run('invoice.payment_failed', oct + 21, paid);
      await f.run('invoice.paid', oct + 22, paid);
      expect(f.membership.status).toBe(status);
      expect(f.account.validUntil).toEqual(new Date(oct * 1000));
      expect(f.records.get('arrears').status).toBe('SUCCEEDED');
      expect(f.tx.creditAccount.upsert).not.toHaveBeenCalled();
    });
    it('cannot be downgraded into dunning by a later subscription past_due event', async () => {
      const f = fixture(); f.membership.status = status;
      await f.run('customer.subscription.updated', oct + 10, { id: 'sub', status: 'past_due', current_period_start: oct, current_period_end: nov });
      await f.run('invoice.paid', oct + 20, f.invoice('arrears', oct, nov, oct + 20));
      expect(f.membership.status).toBe(status);
      expect(f.account.validUntil).toEqual(new Date(oct * 1000));
    });
  });
  it.each(['restriction-first', 'paid-first'])('explicit cancellation wins a same-second payment tie (%s)', async order => {
    const f = fixture(); const at = oct + 10;
    const cancel = () => f.run('customer.subscription.deleted', at, { id: 'sub', status: 'canceled', current_period_start: oct, current_period_end: nov });
    const paid = () => f.run('invoice.paid', at, f.invoice('tied', oct, nov, at));
    if (order === 'restriction-first') { await cancel(); await paid(); } else { await paid(); await cancel(); }
    await paid();
    expect(f.membership.status).toBe('CANCELLED');
    expect(vipMembershipPaidThrough(f.membership, new Date((at + 1) * 1000))).toBeNull();
    expect(f.records.get('tied').status).toBe('SUCCEEDED');
  });
  it('allows an authorized resume followed by a fresh paid renewal despite an old explicit restriction watermark', async () => {
    const f = fixture();
    const dec = Date.parse('2026-12-03T16:00Z') / 1000;
    await f.run('customer.subscription.updated', oct + 10, { id: 'sub', status: 'paused', current_period_start: oct, current_period_end: dec });
    await f.run('customer.subscription.updated', oct + 11, { id: 'sub', status: 'active', current_period_start: oct, current_period_end: dec });
    expect(f.membership.status).toBe('PAUSED');
    // The existing approved admin UNPAUSE transition, not a Stripe ACTIVE event.
    await f.tx.membership.update({ data: { status: 'ACTIVE' } });
    expect(vipMembershipPaidThrough(f.membership, new Date((oct + 12) * 1000))).toBeNull();
    await f.run('invoice.paid', oct + 20, f.invoice('resumed', oct, nov, oct + 20));
    expect(vipMembershipPaidThrough(f.membership, new Date((oct + 30) * 1000))).toEqual(new Date(nov * 1000));
  });
  it('records stale payments but cannot truncate the latest paid period, reset credits, or replay a duplicate grant', async () => {
    const f = fixture();
    await f.run('invoice.paid', oct + 10, f.invoice('new', oct, nov));
    await f.run('invoice.paid', nov + 10, f.invoice('old', sep, oct));
    expect(f.account.validUntil).toEqual(new Date(nov * 1000));
    await f.run('invoice.paid', nov + 20, f.invoice('new', oct, nov));
    expect(f.account.validUntil).toEqual(new Date(nov * 1000));
    expect(f.membership.currentPeriodStart).toEqual(new Date(oct * 1000));
    expect(f.records.size).toBe(2);
    expect([...f.records.values()].every(record => record.status === 'SUCCEEDED')).toBe(true);
    expect(f.tx.creditAccount.upsert).toHaveBeenCalledTimes(1);
    expect(f.purchase.policyAcceptance.termsAccepted).toBe(true);
    expect(f.purchase.paidAt).toEqual(new Date(sep * 1000));
  });
  it('ignores delayed failed and stale subscription events after a newer paid window, without downgrading successful revenue', async () => {
    const f = fixture();
    await f.run('invoice.paid', oct + 20, f.invoice('new', oct, nov, oct + 10));
    await f.run('invoice.payment_failed', oct + 5, f.invoice('new', oct, nov));
    await f.run('customer.subscription.updated', sep + 5, { id: 'sub', status: 'past_due', current_period_start: sep, current_period_end: oct });
    expect(f.membership.status).toBe('ACTIVE');
    expect(f.membership.currentPeriodEnd).toEqual(new Date(nov * 1000));
    expect(f.records.get('new').status).toBe('SUCCEEDED');
    expect(vipMembershipPaidThrough(f.membership, new Date((oct + 30) * 1000))).toEqual(new Date(nov * 1000));
  });
  it('does not revive a newer cancellation with an old paid invoice or checkout replay', async () => {
    const f = fixture();
    await f.run('customer.subscription.deleted', oct + 40, { id: 'sub', status: 'canceled', current_period_start: oct, current_period_end: nov });
    await f.run('invoice.paid', oct + 50, f.invoice('late-old', sep, oct, sep + 10));
    await f.run('checkout.session.completed', sep, { id: 'cs', amount_total: 22200, currency: 'usd', subscription: 'sub', payment_status: 'paid', metadata: { purchaseId: 'purchase' } });
    expect(f.membership.status).toBe('CANCELLED');
    expect(f.records.get('late-old').status).toBe('SUCCEEDED');
    expect(vipMembershipPaidThrough(f.membership, new Date((oct + 60) * 1000))).toBeNull();
  });
  it('failed current renewal and ACTIVE subscription period alone never grant access; a fresh paid invoice does', async () => {
    const f = fixture();
    await f.run('invoice.payment_failed', oct + 5, f.invoice('new', oct, nov));
    await f.run('customer.subscription.updated', oct + 10, { id: 'sub', status: 'active', current_period_start: oct, current_period_end: nov });
    expect(f.account.validUntil).toEqual(new Date(oct * 1000));
    expect(f.membership.status).toBe('PAST_DUE');
    expect(vipMembershipPaidThrough(f.membership, new Date((oct + 15) * 1000))).toBeNull();
    await f.run('invoice.paid', oct + 20, f.invoice('new', oct, nov, oct + 20));
    expect(vipMembershipPaidThrough(f.membership, new Date((oct + 30) * 1000))).toEqual(new Date(nov * 1000));
  });
  it('uses purchase row locking to serialize entitlement state shared by sync and webhook transactions', async () => {
    const f = fixture();
    await f.run('invoice.paid', oct, f.invoice('new', oct, nov));
    expect(f.tx.$queryRaw).toHaveBeenCalled();
    expect(f.tx.$queryRaw.mock.calls[0][0].join('?')).toContain('FOR UPDATE');
  });
  it('takes entitlement dates from the paid subscription line, not an unrelated adjustment line', async () => {
    const f = fixture();
    const invoice = f.invoice('new', oct, nov);
    invoice.lines.data.unshift({ type: 'invoiceitem', period: { start: sep, end: oct } });
    await f.run('invoice.paid', oct + 10, invoice);
    expect(f.account.validUntil).toEqual(new Date(nov * 1000));
    expect(f.membership.currentPeriodEnd).toEqual(new Date(nov * 1000));
  });
  it('accepts a Stripe-settled zero-due recurring invoice without treating unpaid subscription activity as proof', async () => {
    const f = fixture();
    await f.run('invoice.paid', oct + 10, { ...f.invoice('credit-settled', oct, nov), amount_paid: 0, amount_due: 0 });
    expect(vipMembershipPaidThrough(f.membership, new Date((oct + 30) * 1000))).toEqual(new Date(nov * 1000));
    expect(f.records.get('credit-settled').amountCents).toBe(0);
  });
  it('preserves the latest purchase payment anchor and original purchase date across stale invoice and checkout deliveries', async () => {
    const f = fixture();
    await f.run('invoice.paid', oct + 10, { ...f.invoice('new', oct, nov), payment_intent: 'pi_new' });
    await f.run('invoice.paid', oct + 20, { ...f.invoice('old', sep, oct), payment_intent: 'pi_old' });
    await f.run('checkout.session.completed', sep, { id: 'cs', amount_total: 22200, currency: 'usd', subscription: 'sub', payment_status: 'paid', metadata: { purchaseId: 'purchase' } });
    expect(f.purchase.stripePaymentIntentId).toBe('pi_new');
    expect(f.purchase.paidAt).toEqual(new Date(sep * 1000));
    expect(f.records.get('new').stripePaymentIntentId).toBe('pi_new');
    expect(f.records.get('old').stripePaymentIntentId).toBe('pi_old');
  });
  it.each(['checkout-first', 'invoice-first'])('initial native VIP purchase works %s without checkout minting a paid window', async (order) => {
    const f = fixture();
    let created = false;
    f.purchase.status = 'PENDING'; f.purchase.paidAt = null; f.purchase.creditAccount = null;
    f.account.validUntil = null;
    f.tx.membership.findUnique = async () => created ? f.membership : null;
    f.tx.membership.upsert = async ({ create, update }: any) => { Object.assign(f.membership, created ? update : create); created = true; return f.membership; };
    f.tx.creditAccount.upsert.mockImplementation(async ({ create, update }: any) => {
      Object.assign(f.account, f.purchase.creditAccount ? update : create);
      f.purchase.creditAccount = f.account; return f.account;
    });
    const checkout = () => f.run('checkout.session.completed', sep, { id: 'cs', amount_total: 22200, currency: 'usd', subscription: 'sub', payment_status: 'paid', metadata: { purchaseId: 'purchase' } });
    const invoice = () => f.run('invoice.paid', sep + 1, { ...f.invoice('first', sep, oct, sep + 1), metadata: { purchaseId: 'purchase' } });
    if (order === 'checkout-first') {
      await checkout();
      expect(vipMembershipPaidThrough(f.membership, new Date((sep + 1) * 1000))).toBeNull();
      await invoice();
    } else { await invoice(); await checkout(); }
    expect(vipMembershipPaidThrough(f.membership, new Date((sep + 2) * 1000))).toEqual(new Date(oct * 1000));
  });
});
