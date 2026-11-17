import { describe, expect, it, vi } from 'vitest';
import { stripeFinancialProvider } from '@/lib/payments/refund-review-stripe';
import { TRIAL_POLICY_VERSION } from '@/lib/domain/memberships/trial-policy-consent';
import type { FinancialOperation } from '@/lib/payments/refund-review';
function fixture() {
  const payment: any = {
    id: 'synthetic-fee',
    stripePaymentIntentId: 'synthetic-original',
    stripeCustomerId: 'synthetic-customer',
    amountCents: 1000,
    refundedAmountCents: 1000,
    currency: 'usd',
    kind: 'NO_SHOW_FEE',
    status: 'REFUNDED',
    bookingId: 'synthetic-booking',
    userId: 'synthetic-member',
  };
  const pi: any = {
    id: payment.stripePaymentIntentId,
    status: 'succeeded',
    latest_charge: 'synthetic-charge',
    amount_received: 1000,
    currency: 'usd',
    customer: payment.stripeCustomerId,
    payment_method: 'synthetic-card',
    livemode: false,
  };
  const source: any = {
    ...pi,
    id: 'synthetic-purchase-intent',
    amount_received: 700,
  };
  const charge: any = {
    id: 'synthetic-charge',
    paid: true,
    captured: true,
    amount_captured: 1000,
    amount: 1000,
    amount_refunded: 1000,
    customer: payment.stripeCustomerId,
    currency: 'usd',
    payment_intent: pi.id,
  };
  const card: any = {
    id: 'synthetic-card',
    type: 'card',
    customer: payment.stripeCustomerId,
  };
  const booking: any = {
    id: payment.bookingId,
    userId: payment.userId,
    attendance: { status: 'NO_SHOW', updatedAt: new Date(0) },
    updatedAt: new Date(0),
    policySnapshot: { creditAccountId: 'synthetic-credits' },
  };
  const purchase: any = {
    id: 'synthetic-purchase',
    userId: payment.userId,
    stripePaymentIntentId: source.id,
    status: 'PAID',
    refundedAmountCents: 0,
    amountCents: 700,
    currency: 'usd',
    policyAcceptedAt: new Date(0),
    policyAcceptance: {
      version: TRIAL_POLICY_VERSION,
      noShowFeeCents: 1000,
      savedPaymentMethodConsent: true,
    },
  };
  const attempts: any[] = [pi, source];
  const refunds: any[] = [
    { id: 'synthetic-original-refund', amount: 1000, status: 'succeeded' },
  ];
  let scanned = 0;
  const stripe: any = {
    accounts: { retrieve: async () => ({ id: 'synthetic-account' }) },
    paymentIntents: {
      retrieve: async (id: string) => (id === pi.id ? pi : source),
      list: () => ({
        async *[Symbol.asyncIterator]() {
          for (const attempt of attempts) {
            scanned++;
            yield attempt;
          }
        },
      }),
      create: vi.fn(),
    },
    charges: { retrieve: async () => charge },
    paymentMethods: { retrieve: async () => card },
    refunds: {
      list: () => ({
        async *[Symbol.asyncIterator]() {
          yield* refunds;
        },
      }),
      retrieve: vi.fn(),
      create: vi.fn(),
    },
  };
  const tx: any = {
    commerceOrder: { count: async () => 0 },
    paymentRecord: {
      findUniqueOrThrow: async () => payment,
      count: async () => 0,
    },
    booking: { findUniqueOrThrow: async () => booking },
    creditAccount: {
      findUniqueOrThrow: async () => ({ sourcePurchase: purchase }),
    },
  };
  return {
    payment,
    pi,
    source,
    charge,
    card,
    booking,
    purchase,
    attempts,
    refunds,
    stripe,
    tx,
    provider: stripeFinancialProvider(stripe),
    scanned: () => scanned,
  };
}
describe('server-derived replacement proof', () => {
  it('exhausts the attempt iterable and binds original card, purchase consent and amount', async () => {
    const f = fixture();
    const proof = await f.provider.inspect(f.tx, f.payment.id, 'REPLACEMENT');
    expect(f.scanned()).toBe(2);
    expect(proof).toMatchObject({
      amountCents: 1000,
      cardId: 'synthetic-card',
      customerId: 'synthetic-customer',
      accountId: 'synthetic-account',
      bookingId: 'synthetic-booking',
    });
  });
  it.each([
    'card',
    'attendance',
    'policy',
    'amount',
    'pending',
    'unknown',
    'refund',
  ])('blocks changed %s evidence before submit', async (field) => {
    const f = fixture();
    if (field === 'card') f.card.customer = null;
    if (field === 'attendance') f.booking.attendance.status = 'CHECKED_IN';
    if (field === 'policy')
      f.purchase.policyAcceptance.version = 'unrecognized';
    if (field === 'amount') f.payment.amountCents = 999;
    if (field === 'pending')
      f.attempts.push({
        id: 'synthetic-pending',
        status: 'requires_capture',
        metadata: { bookingId: 'other-booking' },
      });
    if (field === 'unknown')
      f.attempts.push({
        id: 'synthetic-unknown',
        status: 'succeeded',
        metadata: {},
      });
    if (field === 'refund') f.refunds[0].status = 'pending';
    await expect(
      f.provider.inspect(f.tx, f.payment.id, 'REPLACEMENT'),
    ).rejects.toThrow();
    expect(f.stripe.paymentIntents.create).not.toHaveBeenCalled();
  });
  it('rejects incomplete pagination rather than assuming the first page is complete', async () => {
    const f = fixture();
    f.stripe.paymentIntents.list = () => ({
      async *[Symbol.asyncIterator]() {
        yield f.pi;
        throw Error('page 2 unavailable');
      },
    });
    await expect(
      f.provider.inspect(f.tx, f.payment.id, 'REPLACEMENT'),
    ).rejects.toThrow('page 2');
  });
  it('retrieves a refund receipt independently and exposes mismatched metadata', async () => {
    const f = fixture();
    f.stripe.refunds.retrieve.mockResolvedValue({
      id: 'synthetic-refund',
      metadata: { approvedOperationId: 'different-operation' },
      payment_intent: f.pi.id,
      charge: f.charge.id,
      amount: 1000,
      currency: 'usd',
      status: 'pending',
    });
    const payload = await f.provider.inspect(f.tx, f.payment.id, 'REPLACEMENT');
    const op = {
      id: 'synthetic-operation',
      kind: 'REFUND',
      payload,
      providerId: 'synthetic-refund',
    } as FinancialOperation;
    const receipt = await f.provider.receipt(op);
    expect(f.stripe.refunds.retrieve).toHaveBeenCalledWith('synthetic-refund');
    expect(receipt?.operationId).toBe('different-operation');
  });
});

describe('refund correction evidence', () => {
  it('changes refund proof when current attendance or booking version changes', async () => {
    const f = fixture();
    f.payment.refundedAmountCents = 0;
    f.payment.status = 'SUCCEEDED';
    f.charge.amount_refunded = 0;
    f.refunds.length = 0;
    f.tx.$queryRaw = async () => [];
    f.booking.attendance.status = 'CHECKED_IN';
    const before = await f.provider.inspect(f.tx, f.payment.id, 'REFUND');
    f.booking.attendance.status = 'NO_SHOW';
    f.booking.updatedAt = new Date(1000);
    const after = await f.provider.inspect(f.tx, f.payment.id, 'REFUND');
    expect(after.evidence).not.toBe(before.evidence);
  });
});

describe('recurring invoice refunds retain service and recurring billing', () => {
  function recurring() {
    const f = fixture();
    Object.assign(f.payment, {
      bookingId: null,
      purchaseId: 'purchase',
      membershipId: 'membership',
      stripeInvoiceId: 'invoice',
      stripeSubscriptionId: 'subscription',
      refundedAmountCents: 0,
      status: 'SUCCEEDED',
      kind: 'MEMBERSHIP_RENEWAL',
    });
    f.charge.amount_refunded = 0;
    f.refunds.length = 0;
    const membership = {
      id: 'membership',
      userId: f.payment.userId,
      stripeSubscriptionId: 'subscription',
    };
    f.tx.purchase = { findUnique: async () => ({ ...f.purchase, membership }) };
    f.tx.membership = { findUnique: async () => membership };
    const invoice = {
      id: 'invoice',
      customer: f.payment.stripeCustomerId,
      livemode: false,
      status: 'paid',
      currency: 'usd',
      parent: { subscription_details: { subscription: 'subscription' } },
    };
    const invoicePayments = [
      {
        id: 'invoice-payment',
        invoice: 'invoice',
        status: 'paid',
        amount_paid: 1000,
        currency: 'usd',
        livemode: false,
        payment: { type: 'payment_intent', payment_intent: f.pi.id },
      },
    ];
    f.stripe.invoices = { retrieve: vi.fn(async () => invoice) };
    f.stripe.invoicePayments = {
      list: () => ({
        async *[Symbol.asyncIterator]() {
          yield* invoicePayments;
        },
      }),
    };
    f.stripe.subscriptions = { update: vi.fn(), cancel: vi.fn() };
    return { ...f, invoice, invoicePayments };
  }
  it('binds the exact paid invoice, not the original subscription purchase amount', async () => {
    const f = recurring();
    expect(
      await f.provider.inspect(f.tx, f.payment.id, 'REFUND'),
    ).toMatchObject({
      amountCents: 1000,
      servicePolicy: 'PRESERVE_RECURRING_SERVICE',
      subscriptionId: 'subscription',
      invoiceId: 'invoice',
    });
    expect(f.stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(f.stripe.subscriptions.cancel).not.toHaveBeenCalled();
  });
  it('blocks an original recurring service purchase rather than silently revoking paid access', async () => {
    const f = recurring();
    f.purchase.stripePaymentIntentId = f.payment.stripePaymentIntentId;
    await expect(
      f.provider.inspect(f.tx, f.payment.id, 'REFUND'),
    ).rejects.toThrow(/Original subscription purchase/);
  });
  it.each(['customer', 'subscription', 'intent', 'pagination'])(
    'fails closed on changed %s proof',
    async (field) => {
      const f = recurring();
      if (field === 'customer') f.invoice.customer = 'wrong';
      if (field === 'subscription')
        f.invoice.parent.subscription_details.subscription = 'wrong';
      if (field === 'intent')
        f.invoicePayments[0].payment.payment_intent = 'wrong';
      if (field === 'pagination')
        f.stripe.invoicePayments.list = () => ({
          async *[Symbol.asyncIterator]() {
            yield f.invoicePayments[0];
            throw Error('page unavailable');
          },
        });
      await expect(
        f.provider.inspect(f.tx, f.payment.id, 'REFUND'),
      ).rejects.toThrow();
      expect(f.stripe.refunds.create).not.toHaveBeenCalled();
    },
  );
});

it('rejects refund receipt lookup returning a different provider identity', async () => {
  const f = fixture();
  const payload = await f.provider.inspect(f.tx, f.payment.id, 'REPLACEMENT');
  f.stripe.refunds.retrieve.mockResolvedValue({
    id: 'wrong',
    charge: payload.chargeId,
    payment_intent: payload.paymentIntentId,
    amount: 1000,
    currency: 'usd',
    status: 'succeeded',
    metadata: { approvedOperationId: 'op' },
  });
  await expect(
    f.provider.receipt({
      id: 'op',
      kind: 'REFUND',
      providerId: 'expected',
      payload,
    } as any),
  ).rejects.toThrow(/identity/);
});

it('rejects a commerce intent even when its local payment association is missing', async () => {
  const f = fixture();
  f.tx.commerceOrder.count = async () => 1;
  await expect(
    f.provider.inspect(f.tx, f.payment.id, 'REPLACEMENT'),
  ).rejects.toThrow(/commerce/i);
  expect(f.stripe.paymentIntents.create).not.toHaveBeenCalled();
});
it.each(['REFUND','REPLACEMENT'] as const)('a slow account check cannot submit %s after transaction expiry',async kind=>{
 const f=fixture();let release!:()=>void;const accountReady=new Promise<void>(r=>{release=r;});
 f.stripe.accounts.retrieve=vi.fn(async()=>{await accountReady;return{id:'synthetic-account'};});
 f.stripe.paymentIntents.create=vi.fn();
 const guard=vi.fn(async()=>{throw Error('Financial preparation deadline expired');});
 const pending=f.provider.submit({kind,payload:{accountId:'synthetic-account'}} as FinancialOperation,guard);
 expect(guard).not.toHaveBeenCalled();release();await expect(pending).rejects.toThrow('deadline');
 expect(guard).toHaveBeenCalledTimes(1);expect(f.stripe.refunds.create).not.toHaveBeenCalled();expect(f.stripe.paymentIntents.create).not.toHaveBeenCalled();
});
