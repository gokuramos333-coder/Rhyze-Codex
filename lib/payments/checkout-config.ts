import type Stripe from 'stripe';
import type { BillingInterval } from '@prisma/client';

export function buildProductCheckoutLineItem(product: {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  billingInterval: BillingInterval;
  stripePriceId: string | null;
}): Stripe.Checkout.SessionCreateParams.LineItem {
  if (!Number.isSafeInteger(product.priceCents) || product.priceCents < 0) {
    throw new Error('Invalid product price');
  }
  // One-time packs/trials can retain an old recurring catalog ID after a
  // product edit. Never let that ID change the customer's purchase cadence.
  // Match the existing event-checkout pattern: server-owned amount, no renewal.
  if (product.billingInterval === 'ONE_TIME') {
    return {
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: product.priceCents,
        product_data: {
          name: product.name,
          ...(product.description ? { description: product.description } : {}),
          metadata: { rhyzeProductId: product.id },
        },
      },
    };
  }
  // Recurring plan changes depend on the synchronized provider price identity.
  if (!product.stripePriceId) throw new Error('Recurring product requires a Stripe price');
  return { quantity: 1, price: product.stripePriceId };
}

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
