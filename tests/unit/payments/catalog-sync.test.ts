import { describe, expect, it } from 'vitest';
import { buildStripeCatalogEntry } from '@/lib/payments/catalog-sync';

const baseProduct = {
  id: 'product_elevate',
  name: 'Elevate',
  slug: 'elevate',
  description: 'Four standard classes each month.',
  priceCents: 9_200,
  billingInterval: 'MONTHLY' as const,
  isActive: true,
  isPublic: true,
};

describe('Stripe catalog mapping', () => {
  it('maps monthly memberships to recurring Stripe prices', () => {
    expect(buildStripeCatalogEntry(baseProduct)).toEqual({
      product: {
        name: 'Elevate',
        description: 'Four standard classes each month.',
        metadata: { rhyzeProductId: 'product_elevate', rhyzeSlug: 'elevate' },
      },
      price: {
        currency: 'usd',
        unit_amount: 9_200,
        recurring: { interval: 'month' },
        lookup_key: 'rhyze_elevate_monthly_9200',
        metadata: { rhyzeProductId: 'product_elevate' },
      },
    });
  });

  it('maps class credits and trials to one-time Stripe prices', () => {
    const entry = buildStripeCatalogEntry({
      ...baseProduct,
      id: 'drop_in',
      slug: 'single-class',
      name: 'Single Class',
      priceCents: 2_500,
      billingInterval: 'ONE_TIME',
    });

    expect(entry?.price).toEqual({
      currency: 'usd',
      unit_amount: 2_500,
      lookup_key: 'rhyze_single-class_one_time_2500',
      metadata: { rhyzeProductId: 'drop_in' },
    });
  });

  it('does not publish inactive or private products', () => {
    expect(buildStripeCatalogEntry({ ...baseProduct, isActive: false })).toBeNull();
    expect(buildStripeCatalogEntry({ ...baseProduct, isPublic: false })).toBeNull();
  });

  it('can intentionally sync an active private-link membership', () => {
    expect(
      buildStripeCatalogEntry(
        { ...baseProduct, isPublic: false, slug: 'og-rhyze-tribe-2026' },
        { allowPrivate: true },
      )?.price.lookup_key,
    ).toBe('rhyze_og-rhyze-tribe-2026_monthly_9200');
  });
});
