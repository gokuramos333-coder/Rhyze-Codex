import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('commerce refund accounting', () => {
  it('stores an immutable dated commerce refund in the refund transaction', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    const helper = readFileSync('lib/payments/commerce-refunds.ts', 'utf8');

    expect(schema).toContain('model CommerceRefund');
    expect(schema).toContain('commerceOrderId String');
    expect(schema).toContain('stripeRefundId String?  @unique');
    expect(schema).toContain('status          String   @default("SUCCEEDED")');
    expect(schema).toContain('operationKey    String?  @unique');
    expect(helper).toContain('tx.commerceRefund.create');
    expect(helper).toContain('stripeRefundId: refund.id');
    expect(helper).toContain("status: 'SUCCEEDED'");
  });

  it('backfills historical commerce refunds without deleting order totals', () => {
    const migration = readFileSync(
      'prisma/migrations/20260908_add_commerce_refunds/migration.sql',
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE "CommerceRefund"');
    expect(migration).toContain('INSERT INTO "CommerceRefund"');
    expect(migration).toContain('"refundedAmountCents" > 0');
    expect(migration).not.toContain('DELETE FROM');
  });
});
