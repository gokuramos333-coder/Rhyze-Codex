import type Stripe from 'stripe';
import type { BillingInterval } from '@prisma/client';
import { productCheckoutCadence } from '@/lib/catalog/product-cadence';

export type StripeCatalogProduct = {
  id: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  billingInterval: BillingInterval;
  customPlanType?: string | null;
  isActive: boolean;
  isPublic: boolean;
};

type CatalogSyncOptions = { allowPrivate?: boolean };

export function buildStripeCatalogEntry(
  product: StripeCatalogProduct,
  options: CatalogSyncOptions = {},
) {
  if (!product.isActive || (!product.isPublic && !options.allowPrivate)) return null;
  const interval = product.billingInterval.toLowerCase();
  const cadence = productCheckoutCadence(product);
  const recurring = product.billingInterval === 'ONE_TIME'
    ? undefined
    : {
        interval: interval === 'yearly' ? 'year' as const : 'month' as const,
        ...(cadence.stripeIntervalCount === 1 ? {} : { interval_count: cadence.stripeIntervalCount }),
      };
  const lookupCadence = cadence.stripeIntervalCount === 1 ? '' : `_${cadence.stripeIntervalCount}`;

  return {
    product: {
      name: product.name,
      description: product.description,
      metadata: { rhyzeProductId: product.id, rhyzeSlug: product.slug },
    },
    price: {
      currency: 'usd',
      unit_amount: product.priceCents,
      ...(recurring ? { recurring } : {}),
      lookup_key: `rhyze_${product.slug}_${interval}${lookupCadence}_${product.priceCents}`,
      metadata: { rhyzeProductId: product.id },
    },
  };
}

export async function syncStripeCatalogEntry(
  stripe: Stripe,
  product: StripeCatalogProduct,
  options: CatalogSyncOptions = {},
) {
  const entry = buildStripeCatalogEntry(product, options);
  if (!entry) return null;
  const prices = await stripe.prices.list({
    lookup_keys: [entry.price.lookup_key],
    active: true,
    limit: 1,
  });
  if (prices.data[0]) return prices.data[0];

  const existingProducts = await stripe.products.search({
    query: `metadata['rhyzeProductId']:'${product.id}'`,
    limit: 1,
  });
  const stripeProduct = existingProducts.data[0] ?? await stripe.products.create(
    entry.product,
    { idempotencyKey: `rhyze-product-${product.id}` },
  );
  return stripe.prices.create(
    { ...entry.price, product: stripeProduct.id },
    { idempotencyKey: `rhyze-price-${entry.price.lookup_key}` },
  );
}
