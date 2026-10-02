import {
  parseMemberPricing,
  type MemberPricingInput,
  type MemberPricing,
} from './member-pricing';
import { buildCheckoutWalletParameters } from '@/lib/payments/checkout-config';
import type { BillingInterval, ProductKind } from '@prisma/client';
import {
  attributionMetadata,
  type SourceAttribution,
} from '@/lib/attribution/first-touch';

type CheckoutClient = {
  id: string;
  email: string;
  name: string | null;
  stripeCustomerId: string | null;
} & Partial<{ [K in keyof SourceAttribution]: SourceAttribution[K] | null }>;

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
  createPurchase(input: {
    userId: string;
    productId: string;
    amountCents: number;
    policyAcceptance?: Record<string, unknown>;
  }): Promise<{ id: string; stripeCheckoutSessionId?: string | null }>;
  createClientDiscount?(
    pricing: MemberPricing,
    product: CheckoutProduct,
    userId: string,
    purchaseId: string,
  ): Promise<string>;
  createCheckoutSession(
    input: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<{ id: string; url: string | null }>;
  retrieveCheckoutSession?(
    id: string,
  ): Promise<{
    status: string | null;
    url: string | null;
    client_reference_id: string | null;
  }>;
  saveCheckoutSession(
    purchaseId: string,
    checkoutSessionId: string,
  ): Promise<void>;
  failPurchase(purchaseId: string): Promise<void>;
};

const paidMembershipKinds: ProductKind[] = [
  'MONTHLY_UNLIMITED',
  'LIMITED_MEMBERSHIP',
  'VIP',
];

export function isAdminPaidMembershipProduct(
  product: CheckoutProduct | null,
): product is CheckoutProduct {
  return Boolean(
    product?.isActive &&
    product.stripePriceId &&
    product.billingInterval !== 'ONE_TIME' &&
    paidMembershipKinds.some((kind) => kind === product.kind),
  );
}

export async function startAdminMembershipCheckout(
  input: {
    clientId: string;
    productId: string;
    origin: string;
  } & MemberPricingInput,
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

  const pricing = parseMemberPricing(input, product.priceCents);
  if (pricing && product.billingInterval !== 'MONTHLY')
    throw Error('Client pricing is only supported for monthly memberships.');
  if (pricing?.amountOff && !dependencies.createClientDiscount)
    throw Error('Client pricing is unavailable. No purchase was started.');
  const purchase = await dependencies.createPurchase({
    userId: client.id,
    productId: product.id,
    amountCents: pricing?.monthlyCents ?? product.priceCents,
    policyAcceptance: {
      source: 'ADMIN_CHECKOUT',
      ...(pricing ? { memberPricing: pricing } : {}),
    },
  });
  if (purchase.stripeCheckoutSessionId) {
    if (!dependencies.retrieveCheckoutSession)
      throw Error('The existing checkout must be verified before continuing.');
    const existing = await dependencies.retrieveCheckoutSession(
      purchase.stripeCheckoutSessionId,
    );
    if (existing.client_reference_id !== purchase.id)
      throw Error('Existing checkout does not match this purchase.');
    if (existing.status === 'open' && existing.url) return existing.url;
    if (existing.status === 'expired') {
      await dependencies.failPurchase(purchase.id);
      throw Error(
        'The previous checkout expired. Review the membership and start a new checkout.',
      );
    }
    throw Error(
      'The existing checkout is processing or completed. Refresh the client before another billing action.',
    );
  }
  const origin = input.origin.replace(/\/$/, '');
  try {
    const couponId = pricing?.amountOff
      ? await dependencies.createClientDiscount!(
          pricing,
          product,
          client.id,
          purchase.id,
        )
      : null;
    const session = await dependencies.createCheckoutSession(
      {
        mode: 'subscription',
        ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
        ...buildCheckoutWalletParameters(),
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
          ...attributionMetadata(client),
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
      },
      `admin-membership-checkout-${purchase.id}`,
    );
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    await dependencies.saveCheckoutSession(purchase.id, session.id);
    return session.url;
  } catch (error) {
    // A timeout can occur after Stripe created checkout. Keep the pending request
    // so staff cannot accidentally start a second subscription while its result is unknown.
    if ((error as { type?: string }).type === 'StripeInvalidRequestError') {
      await dependencies.failPurchase(purchase.id);
      throw error;
    }
    throw new Error(
      'Checkout could not be verified. Check this client’s pending purchase in Stripe before starting another. No access was granted.',
    );
  }
}
