import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('commerce refund accounting', () => {
  it('stores an immutable dated commerce refund in the refund transaction', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    const actions = readFileSync('app/(studio)/admin/payments/actions.ts', 'utf8');

    expect(schema).toContain('model CommerceRefund');
    expect(schema).toContain('commerceOrderId String');
    expect(schema).toContain('stripeRefundId String?  @unique');
    expect(actions).toContain('tx.commerceRefund.create');
    expect(actions).toContain('stripeRefundId: refund.id');
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
