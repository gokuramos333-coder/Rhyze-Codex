import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildProductCheckoutLineItem } from '@/lib/payments/checkout-config';
const product = { id: 'pack', name: '8-Class Pack', description: 'Eight standard classes', priceCents: 16800, billingInterval: 'ONE_TIME' as const, stripePriceId: 'price_wrong_recurring' };

describe('checkout cadence is owned by the authorized application product', () => {
  it.each(['8-Class Pack', 'Intro Offer 7-Days', 'Single Class'])('never sends a stale recurring catalog ID for one-time %s', (name) => {
    const line = buildProductCheckoutLineItem({ ...product, name });
    expect(line).toEqual({ quantity: 1, price_data: { currency: 'usd', unit_amount: 16800, product_data: { name, description: product.description, metadata: { rhyzeProductId: 'pack' } } } });
    expect(line).not.toHaveProperty('price');
    expect(line.price_data).not.toHaveProperty('recurring');
  });
  it('allows a one-time product without a provider catalog link', () => {
    expect(buildProductCheckoutLineItem({ ...product, stripePriceId: null }).price_data?.unit_amount).toBe(16800);
  });
  it.each(['MONTHLY', 'YEARLY'] as const)('preserves %s subscription catalog identity for existing plan-change matching', (billingInterval) => {
    expect(buildProductCheckoutLineItem({ ...product, billingInterval, stripePriceId: 'price_subscription' })).toEqual({ quantity: 1, price: 'price_subscription' });
  });
  it('fails closed for recurring products without a price', () => {
    expect(() => buildProductCheckoutLineItem({ ...product, billingInterval: 'MONTHLY', stripePriceId: null })).toThrow('Recurring product requires a Stripe price');
  });
  it.each([-1, NaN, 100.5])('rejects invalid server-side amounts (%s)', (priceCents) => {
    expect(() => buildProductCheckoutLineItem({ ...product, priceCents })).toThrow('Invalid product price');
  });
  it('wires the shared one-time rule into the membership checkout action before provider creation', () => {
    const source = readFileSync('app/(portal)/member/membership/actions.ts', 'utf8');
    expect(source).toContain('line_items: [buildProductCheckoutLineItem(product)]');
    expect(source).toContain("product.billingInterval !== 'ONE_TIME' && !product.stripePriceId");
    expect(source).not.toContain('line_items: [{ price: product.stripePriceId!');
  });
});
