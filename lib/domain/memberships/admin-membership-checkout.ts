import type { BillingInterval, ProductKind } from '@prisma/client';

type CheckoutClient = {
  id: string;
  email: string;
  name: string | null;
  stripeCustomerId: string | null;
};

type CheckoutProduct = {
  id: string;
  name: string;
  kind: ProductKind;
  isActive: boolean;
  billingInterval: BillingInterval;
  stripePriceId: string | null;
  priceCents: number;
};

type CheckoutDependencies = {
  findClient(id: string): Promise<CheckoutClient | null>;
  findProduct(id: string): Promise<CheckoutProduct | null>;
  hasCurrentMembership(userId: string): Promise<boolean>;
  createPurchase(input: { userId: string; productId: string; amountCents: number }): Promise<{ id: string }>;
  createCheckoutSession(input: Record<string, unknown>, idempotencyKey: string): Promise<{ id: string; url: string | null }>;
  saveCheckoutSession(purchaseId: string, checkoutSessionId: string): Promise<void>;
  failPurchase(purchaseId: string): Promise<void>;
};

const paidMembershipKinds: ProductKind[] = [
  'MONTHLY_UNLIMITED',
  'LIMITED_MEMBERSHIP',
  'VIP',
];

export function isAdminPaidMembershipProduct(product: CheckoutProduct | null): product is CheckoutProduct {
  return Boolean(
    product?.isActive &&
    product.stripePriceId &&
    product.billingInterval !== 'ONE_TIME' &&
    paidMembershipKinds.some((kind) => kind === product.kind),
  );
}

export async function startAdminMembershipCheckout(
  input: { clientId: string; productId: string; origin: string },
  dependencies: CheckoutDependencies,
) {
  const [client, product, hasCurrentMembership] = await Promise.all([
    dependencies.findClient(input.clientId),
    dependencies.findProduct(input.productId),
    dependencies.hasCurrentMembership(input.clientId),
  ]);
  if (!client) throw new Error('Client not found.');
  if (!isAdminPaidMembershipProduct(product)) {
    throw new Error('This plan is not available for paid membership checkout.');
  }
  if (hasCurrentMembership) {
    throw new Error('This client already has a current membership.');
  }

  const purchase = await dependencies.createPurchase({
    userId: client.id,
    productId: product.id,
    amountCents: product.priceCents,
  });
  const origin = input.origin.replace(/\/$/, '');
  try {
    const session = await dependencies.createCheckoutSession({
      mode: 'subscription',
      ...(client.stripeCustomerId
        ? { customer: client.stripeCustomerId }
        : { customer_email: client.email }),
      line_items: [{ price: product.stripePriceId, quantity: 1 }],
      billing_address_collection: 'required',
      client_reference_id: purchase.id,
      metadata: {
        purchaseId: purchase.id,
        productId: product.id,
        userId: client.id,
        customerName: client.name || '',
        customerEmail: client.email,
        initiatedBy: 'ADMIN',
      },
      subscription_data: {
        metadata: {
          purchaseId: purchase.id,
          productId: product.id,
          userId: client.id,
        },
      },
      success_url: `${origin}/admin/members/${client.id}?membership=success`,
      cancel_url: `${origin}/admin/members/${client.id}?membership=cancelled`,
    }, `admin-membership-checkout-${purchase.id}`);
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    await dependencies.saveCheckoutSession(purchase.id, session.id);
    return session.url;
  } catch (error) {
    await dependencies.failPurchase(purchase.id);
    throw error;
  }
}
