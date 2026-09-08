import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildStripeCatalogEntry } from '@/lib/payments/catalog-sync';

describe('September membership catalog changes', () => {
  it('syncs the 8-class pack as a three-month recurring Stripe price', () => {
    const entry = buildStripeCatalogEntry(
      {
        id: 'product-eight-class-pack-2026',
        name: '8-Class Pack',
        slug: 'eight-class-pack',
        description: '8 credits valid for 3 months',
        priceCents: 17900,
        billingInterval: 'MONTHLY',
        customPlanType: 'QUARTERLY_8_CLASS_PACK',
        isActive: true,
        isPublic: true,
      },
      {},
    );

    expect(entry?.price.unit_amount).toBe(17900);
    expect(entry?.price.recurring).toEqual({ interval: 'month', interval_count: 3 });
    expect(entry?.price.lookup_key).toBe('rhyze_eight-class-pack_monthly_3_17900');
  });

  it('deploys data migration for 8-pack launch and VIP $222 regular price', () => {
    const migration = readFileSync(
      'prisma/migrations/20260829160000_september_membership_pack_and_rhyze2026/migration.sql',
      'utf8',
    );
    expect(migration).toContain("'eight-class-pack'");
    expect(migration).toContain('17900');
    expect(migration).toContain("'QUARTERLY_8_CLASS_PACK'");
    expect(migration).toContain("TIMESTAMP '2026-09-01 04:00:00'");
    expect(migration).toContain('22200');
    expect(migration).toContain("WHERE \"slug\" = 'vip-access-pass'");
  });
});
