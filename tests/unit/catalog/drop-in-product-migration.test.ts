import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('standard single-class product migration', () => {
  const source = readFileSync(
    'prisma/migrations/20260725181000_standard_class_price_25/migration.sql',
    'utf8',
  );

  it('moves the standard drop-in product to $25', () => {
    expect(source).toContain("'DROP_IN'");
    expect(source).toContain('2500');
    expect(source).toContain('"isEvent" = false');
  });
});
