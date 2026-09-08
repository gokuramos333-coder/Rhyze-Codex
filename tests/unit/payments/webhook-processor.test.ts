import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import {
  creditGrantForPayment,
  deriveStripeEventAction,
  processStripeEvent,
  stripeMembershipStatus,
} from '@/lib/payments/webhook-processor';

function event(type: string, object: Record<string, unknown>) {
  return {
    id: `evt_${type}`,
    type,
    created: 1_785_000_000,
    data: { object },
  } as unknown as Stripe.Event;
}

describe('Stripe webhook event interpretation', () => {
  it('grants one-time credits at checkout and recurring credits from paid invoices', () => {
    expect(creditGrantForPayment({ billingInterval: 'ONE_TIME', includedCredits: 5 }, 'CHECKOUT')).toBe(5);
    expect(creditGrantForPayment({ billingInterval: 'MONTHLY', includedCredits: 8 }, 'CHECKOUT')).toBeNull();
    expect(creditGrantForPayment({ billingInterval: 'MONTHLY', includedCredits: 8 }, 'INVOICE')).toBe(8);
  });

  it('maps Stripe subscription states to Rhyze access states', () => {
    expect(stripeMembershipStatus('trialing')).toBe('TRIALING');
    expect(stripeMembershipStatus('active')).toBe('ACTIVE');
    expect(stripeMembershipStatus('past_due')).toBe('PAST_DUE');
    expect(stripeMembershipStatus('unpaid')).toBe('PAST_DUE');
    expect(stripeMembershipStatus('paused')).toBe('PAUSED');
    expect(stripeMembershipStatus('canceled')).toBe('CANCELLED');
    expect(stripeMembershipStatus('incomplete_expired')).toBe('EXPIRED');
  });

  it('extracts the subscription from current Stripe invoice payloads', () => {
    expect(deriveStripeEventAction(event('invoice.paid', {
      id: 'in_renewal',
      amount_paid: 9_200,
      currency: 'usd',
      customer: 'cus_member',
      parent: { subscription_details: { subscription: 'sub_member', metadata: { purchaseId: 'purchase_1' } } },
      payments: { data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_renewal' } }] },
      lines: { data: [{ period: { end: 1_787_000_000 } }] },
      status_transitions: { paid_at: 1_785_000_100 },
    }))).toEqual({
      type: 'INVOICE_PAID',
      billingReason: '',
      invoiceId: 'in_renewal',
      subscriptionId: 'sub_member',
      purchaseId: 'purchase_1',
      customerId: 'cus_member',
      paymentIntentId: 'pi_renewal',
      amountCents: 9_200,
      currency: 'usd',
      occurredAt: new Date(1_785_000_100_000),
      currentPeriodEnd: new Date(1_787_000_000_000),
    });
  });

  it('distinguishes failed invoices, checkout completion, and cancellation', () => {
    expect(deriveStripeEventAction(event('invoice.payment_failed', {
      id: 'in_failed',
      amount_due: 16_800,
      currency: 'usd',
      customer: 'cus_member',
      parent: { subscription_details: { subscription: 'sub_member' } },
    }))).toMatchObject({ type: 'INVOICE_FAILED', subscriptionId: 'sub_member', amountCents: 16_800 });

    expect(deriveStripeEventAction(event('checkout.session.completed', {
      id: 'cs_checkout',
      customer: 'cus_member',
      payment_intent: 'pi_checkout',
      subscription: null,
      customer_details: { name: 'Jamie Arleo', email: 'jamie@example.com' },
      metadata: { commerceOrderId: 'order_1' },
    }))).toMatchObject({
      type: 'CHECKOUT_PAID',
      commerceOrderId: 'order_1',
      paymentIntentId: 'pi_checkout',
      customerName: 'Jamie Arleo',
      customerEmail: 'jamie@example.com',
    });

    expect(deriveStripeEventAction(event('customer.subscription.deleted', {
      id: 'sub_member',
      status: 'canceled',
      customer: 'cus_member',
      current_period_start: 1_784_000_000,
      current_period_end: 1_786_000_000,
      cancel_at_period_end: false,
    }))).toMatchObject({ type: 'SUBSCRIPTION_CHANGED', subscriptionId: 'sub_member', status: 'CANCELLED' });
  });

  it('does not fulfill an asynchronous Checkout session before Stripe marks it paid', () => {
    expect(deriveStripeEventAction(event('checkout.session.completed', {
      id: 'cs_unpaid',
      payment_status: 'unpaid',
      metadata: { commerceOrderId: 'order_1' },
    }))).toEqual({ type: 'IGNORE' });
  });

  it('ignores unrelated events without treating them as payments', () => {
    expect(deriveStripeEventAction(event('product.updated', { id: 'prod_1' }))).toEqual({ type: 'IGNORE' });
  });

  it('creates intro trial access and links a Stripe-sync payment record when checkout webhooks are missed', async () => {
    const calls = {
      purchaseUpdate: [] as unknown[],
      membershipUpsert: [] as unknown[],
      creditAccountUpsert: [] as unknown[],
      paymentRecordUpdateMany: [] as unknown[],
      paymentRecordFindFirst: [] as unknown[],
      paymentRecordUpdate: [] as unknown[],
      paymentRecordCreate: [] as unknown[],
      paymentRecordUpsert: [] as unknown[],
      emailUpsert: [] as unknown[],
    };
    const tx = {
      purchase: {
        update: async (args: unknown) => {
          calls.purchaseUpdate.push(args);
          return {
            id: 'purchase_intro',
            userId: 'user_avery',
            productId: 'product_intro',
            amountCents: 700,
            currency: 'usd',
            discountCents: 0,
            product: {
              id: 'product_intro',
              name: 'Intro Offer 7-Days',
              kind: 'INTRO_TRIAL',
              billingInterval: 'ONE_TIME',
              includedCredits: null,
              isUnlimited: true,
            },
            user: { id: 'user_avery', name: 'Avery Decker', email: 'avery@example.com' },
          };
        },
      },
      user: { update: async () => ({}) },
      membership: {
        upsert: async (args: unknown) => {
          calls.membershipUpsert.push(args);
          return { id: 'membership_intro' };
        },
      },
      creditAccount: {
        upsert: async (args: unknown) => {
          calls.creditAccountUpsert.push(args);
          return { id: 'credit_intro' };
        },
      },
      paymentRecord: {
        updateMany: async (args: unknown) => {
          calls.paymentRecordUpdateMany.push(args);
          return { count: 1 };
        },
        findFirst: async (args: unknown) => {
          calls.paymentRecordFindFirst.push(args);
          return null;
        },
        update: async (args: unknown) => {
          calls.paymentRecordUpdate.push(args);
          return {};
        },
        create: async (args: unknown) => {
          calls.paymentRecordCreate.push(args);
          return {};
        },
        upsert: async (args: unknown) => {
          calls.paymentRecordUpsert.push(args);
          return {};
        },
      },
      emailMessage: {
        upsert: async (args: unknown) => {
          calls.emailUpsert.push(args);
          return {};
        },
      },
    };

    await processStripeEvent(tx as never, event('checkout.session.completed', {
      id: 'cs_intro',
      payment_status: 'paid',
      customer: 'cus_avery',
      payment_intent: 'pi_intro',
      subscription: null,
      customer_details: { name: 'Avery Decker', email: 'avery@example.com' },
      metadata: { purchaseId: 'purchase_intro' },
    }));

    expect(calls.purchaseUpdate[0]).toMatchObject({
      where: { id: 'purchase_intro' },
      data: {
        status: 'PAID',
        stripeCheckoutSessionId: 'cs_intro',
        stripePaymentIntentId: 'pi_intro',
      },
    });
    expect(calls.membershipUpsert[0]).toMatchObject({
      where: { purchaseId: 'purchase_intro' },
      create: {
        purchaseId: 'purchase_intro',
        userId: 'user_avery',
        status: 'TRIALING',
      },
    });
    expect(calls.creditAccountUpsert[0]).toMatchObject({
      where: { sourcePurchaseId: 'purchase_intro' },
      create: {
        userId: 'user_avery',
        sourcePurchaseId: 'purchase_intro',
        label: 'Intro trial — unlimited standard class credits for 7 days',
        isUnlimited: true,
      },
    });
    expect(calls.paymentRecordUpdateMany[0]).toMatchObject({
      where: {
        OR: [
          { stripePaymentIntentId: 'pi_intro' },
          { stripeCheckoutSessionId: 'cs_intro' },
        ],
      },
      data: {
        userId: 'user_avery',
        purchaseId: 'purchase_intro',
        membershipId: 'membership_intro',
        status: 'SUCCEEDED',
        stripeCheckoutSessionId: 'cs_intro',
      },
    });
    expect(calls.paymentRecordUpsert).toHaveLength(0);
    expect(calls.emailUpsert).toHaveLength(3);
  });

  it('updates an existing checkout payment record instead of creating a duplicate with the same session id', async () => {
    const calls = {
      paymentRecordUpdateMany: [] as unknown[],
      paymentRecordFindFirst: [] as unknown[],
      paymentRecordUpdate: [] as unknown[],
      paymentRecordCreate: [] as unknown[],
      emailUpsert: [] as unknown[],
    };
    const tx = {
      purchase: {
        update: async () => ({
          id: 'purchase_intro',
          userId: 'user_avery',
          productId: 'product_intro',
          amountCents: 700,
          currency: 'usd',
          discountCents: 0,
          product: {
            id: 'product_intro',
            name: 'Intro Offer 7-Days',
            kind: 'INTRO_TRIAL',
            billingInterval: 'ONE_TIME',
            includedCredits: null,
            isUnlimited: true,
          },
          user: { id: 'user_avery', name: 'Avery Decker', email: 'avery@example.com' },
        }),
      },
      user: { update: async () => ({}) },
      membership: { upsert: async () => ({ id: 'membership_intro' }) },
      creditAccount: { upsert: async () => ({ id: 'credit_intro' }) },
      referralAttribution: { findUnique: async () => null },
      discountRedemption: { findUnique: async () => null },
      paymentRecord: {
        updateMany: async (args: unknown) => {
          calls.paymentRecordUpdateMany.push(args);
          return { count: 0 };
        },
        findFirst: async (args: unknown) => {
          calls.paymentRecordFindFirst.push(args);
          return { id: 'payment_existing' };
        },
        update: async (args: unknown) => {
          calls.paymentRecordUpdate.push(args);
          return {};
        },
        create: async (args: unknown) => {
          calls.paymentRecordCreate.push(args);
          return {};
        },
      },
      emailMessage: {
        upsert: async (args: unknown) => {
          calls.emailUpsert.push(args);
          return {};
        },
      },
    };

    await processStripeEvent(tx as never, event('checkout.session.completed', {
      id: 'cs_intro',
      payment_status: 'paid',
      customer: 'cus_avery',
      payment_intent: 'pi_intro',
      subscription: null,
      customer_details: { name: 'Avery Decker', email: 'avery@example.com' },
      metadata: { purchaseId: 'purchase_intro' },
    }));

    expect(calls.paymentRecordFindFirst[0]).toMatchObject({
      where: {
        OR: [
          { stripeEventId: 'evt_checkout.session.completed' },
          { stripeCheckoutSessionId: 'cs_intro' },
          { stripePaymentIntentId: 'pi_intro' },
        ],
      },
    });
    expect(calls.paymentRecordUpdate[0]).toMatchObject({
      where: { id: 'payment_existing' },
      data: {
        userId: 'user_avery',
        purchaseId: 'purchase_intro',
        membershipId: 'membership_intro',
        stripeCheckoutSessionId: 'cs_intro',
        stripePaymentIntentId: 'pi_intro',
      },
    });
    expect(calls.paymentRecordCreate).toHaveLength(0);
  });
});
