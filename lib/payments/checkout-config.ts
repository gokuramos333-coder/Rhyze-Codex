import type Stripe from 'stripe';

export function buildCheckoutCustomerParameters(input: {
  customerId: string | null;
  email: string;
  mode: 'payment' | 'subscription';
}): Pick<Stripe.Checkout.SessionCreateParams, 'customer' | 'customer_email' | 'customer_creation'> {
  if (input.customerId) return { customer: input.customerId };
  return {
    customer_email: input.email,
    customer_creation: input.mode === 'payment' ? 'always' : undefined,
  };
}

export function buildPortalSessionParameters(input: {
  customerId: string;
  returnUrl: string;
  configurationId?: string;
}): Stripe.BillingPortal.SessionCreateParams {
  return {
    customer: input.customerId,
    return_url: input.returnUrl,
    configuration: input.configurationId || undefined,
  };
}

export function buildSubscriptionData(metadata: {
  purchaseId: string;
  productId: string;
  userId: string;
}): Stripe.Checkout.SessionCreateParams.SubscriptionData {
  // Leaving billing_cycle_anchor unset makes Stripe renew monthly on the
  // signup calendar day (for example, Aug 11 → Sep 11).
  return { metadata };
}
