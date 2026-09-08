import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import {
  fulfillMembershipCheckoutReturn,
  type MembershipCheckoutReturnGateway,
} from '@/lib/payments/membership-checkout-return';

function paidSession(overrides: Partial<Stripe.Checkout.Session> = {}) {
  return {
    id: 'cs_intro',
    payment_status: 'paid',
    metadata: { purchaseId: 'purchase_intro', userId: 'user_intro' },
    ...overrides,
  } as Stripe.Checkout.Session;
}

function gateway(session: Stripe.Checkout.Session) {
  const fulfilled: string[] = [];
  const value: MembershipCheckoutReturnGateway = {
    retrieveSession: async () => session,
    findPurchase: async () => ({
      id: 'purchase_intro',
      userId: 'user_intro',
      stripeCheckoutSessionId: 'cs_intro',
      productKind: 'INTRO_TRIAL',
    }),
    fulfillSession: async (checkoutSession) => {
      fulfilled.push(checkoutSession.id);
    },
  };
  return { value, fulfilled };
}

describe('membership checkout fulfillment', () => {
  it('fulfills a paid Checkout session before returning the buyer to Rhyze', async () => {
    const testGateway = gateway(paidSession());

    const result = await fulfillMembershipCheckoutReturn(
      { sessionId: 'cs_intro', userId: 'user_intro' },
      testGateway.value,
    );

    expect(result).toBe('fulfilled');
    expect(testGateway.fulfilled).toEqual(['cs_intro']);
  });

  it('does not grant access for an unpaid Checkout session', async () => {
    const testGateway = gateway(paidSession({ payment_status: 'unpaid' }));

    const result = await fulfillMembershipCheckoutReturn(
      { sessionId: 'cs_intro', userId: 'user_intro' },
      testGateway.value,
    );

    expect(result).toBe('pending');
    expect(testGateway.fulfilled).toEqual([]);
  });

  it('does not grant one member access from another member’s Checkout session', async () => {
    const testGateway = gateway(paidSession());

    const result = await fulfillMembershipCheckoutReturn(
      { sessionId: 'cs_intro', userId: 'different_user' },
      testGateway.value,
    );

    expect(result).toBe('forbidden');
    expect(testGateway.fulfilled).toEqual([]);
  });
});
