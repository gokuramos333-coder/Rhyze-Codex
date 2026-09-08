import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Somble September 3 renewal correction', () => {
  it('keeps the Prisma and Netlify migration copies identical', () => {
    expect(
      readFileSync(
        'netlify/database/migrations/20260820041000_somble_september_third_renewals.sql',
        'utf8',
      ),
    ).toBe(
      readFileSync(
        'prisma/migrations/20260820041000_somble_september_third_renewals/migration.sql',
        'utf8',
      ),
    );
  });

  it('moves only the three named non-Stripe memberships to the studio-opening cycle', () => {
    const migration = readFileSync(
      'prisma/migrations/20260820041000_somble_september_third_renewals/migration.sql',
      'utf8',
    );

    expect(migration).toContain('jolielampkin@gmail.com');
    expect(migration).toContain('amyanjum2@gmail.com');
    expect(migration).toContain('kimrusbach@gmail.com');
    expect(migration).toContain("'2026-08-03T04:00:00.000Z'");
    expect(migration).toContain("'2026-09-03T04:00:00.000Z'");
    expect(migration).toContain('"stripeSubscriptionId" IS NULL');
    expect(migration).toContain('expected exactly one membership');
  });

  it('removes only Jolie’s unused three-credit test account and records an audit', () => {
    const migration = readFileSync(
      'prisma/migrations/20260820041000_somble_september_third_renewals/migration.sql',
      'utf8',
    );

    expect(migration).toContain(
      'Class credit — Manual admin grant — expires 2026-08-22',
    );
    expect(migration).toContain("cle." + '"quantity" = 3');
    expect(migration).toContain('cle."bookingId" IS NOT NULL');
    expect(migration).toContain("'credit.manual-delete'");
    expect(migration).toContain('DELETE FROM "CreditLedgerEntry"');
    expect(migration).toContain('DELETE FROM "CreditAccount"');
  });
});
