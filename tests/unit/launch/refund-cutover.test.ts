import { describe, it, expect } from 'vitest';
import { assertControlledRefundCutover } from '@/scripts/release/refund-cutover';
describe('unsupported legacy financial cutover fails closed', () => {
  it('blocks publication of the refund migration even when the deploy is locked or SQL is idle', () => {
    expect(() =>
      assertControlledRefundCutover([
        'A\tprisma/migrations/20261113010000_refund_review/migration.sql',
      ]),
    ).toThrow(/immutable.*drain/i);
  });
  it('does not interfere with unrelated releases', () => {
    expect(() =>
      assertControlledRefundCutover(['M\tdocs/readme.md']),
    ).not.toThrow();
  });
});
