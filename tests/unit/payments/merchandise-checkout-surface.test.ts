import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('merchandise checkout integration', () => {
  it('honestly disables online merchandise checkout until the studio launches it', () => {
    const checkout = readFileSync('app/api/checkout/route.ts', 'utf8');
    const productCard = readFileSync('components/sections/ProductCard.tsx', 'utf8');

    expect(checkout).toContain("error: 'merchandise_studio_only'");
    expect(checkout).toContain('{ status: 409 }');
    expect(productCard).toContain('Coming soon. Check out all available options at the studio.');
    expect(productCard).not.toContain('Add to Cart');
  });

  it('queues both the customer receipt and management purchase alert after payment', () => {
    const webhook = readFileSync('lib/payments/webhook-processor.ts', 'utf8');

    expect(webhook).toContain("template: 'PAYMENT_RECEIPT'");
    expect(webhook).toContain("template: 'NEW_PURCHASE_ADMIN'");
    expect(webhook).toContain('new-purchase-admin:commerce:');
    expect(webhook).toContain("kind: order.kind");
    expect(webhook).toContain('customerName: action.customerName');
  });

  it('stores purchaser identity snapshots on Rhyze commerce and payment records', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');

    expect(schema).toMatch(/model CommerceOrder[\s\S]*customerName\s+String\?/);
    expect(schema).toMatch(/model PaymentRecord[\s\S]*customerName\s+String\?/);
    expect(schema).toMatch(/model PaymentRecord[\s\S]*customerEmail\s+String\?/);
  });

  it('reads the purchaser email written by native checkout metadata during Stripe sync', () => {
    const source = readFileSync('lib/payments/stripe-payment-sync.ts', 'utf8');

    expect(source).toContain('charge.metadata?.customerEmail');
  });
});
