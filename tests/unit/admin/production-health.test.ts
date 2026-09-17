import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);

describe('production health monitor', () => {
  it('fails closed on HTTP errors, cross-origin redirects and broken protected gates', () => {
    const { routeStatus } = require('../../../scripts/production-health.cjs');
    expect(routeStatus('/schedule', 500, 'https://www.rhyzefitness.com/schedule')).toBe('FAIL');
    expect(routeStatus('/admin', 200, 'https://www.rhyzefitness.com/admin')).toBe('FAIL');
    expect(routeStatus('/admin', 200, 'https://www.rhyzefitness.com/sign-in?callbackUrl=x')).toBe('PASS');
    expect(routeStatus('/schedule', 200, 'https://example.com/')).toBe('FAIL');
  });
  it('keeps all required database checks in the denominator when unavailable', () => {
    const source = readFileSync('scripts/production-health.cjs', 'utf8');
    expect(source).toContain('for (const name of Object.keys(checks))');
    expect(source).toContain("status:'NOT TESTED'");
    expect(source).not.toContain("name:'database_checks'");
  });
  it('counts NOT TESTED in the health-score denominator and never rounds up', () => {
    const { healthScore } = require('../../../scripts/production-health.cjs');
    expect(healthScore([{status:'PASS'}, {status:'NOT TESTED'}, {status:'FAIL'}])).toEqual({pass:1,total:3,percent:33,status:'ATTENTION'});
    expect(healthScore([]).status).toBe('ATTENTION');
    expect(healthScore([{status:'PASS'}]).percent).toBe(100);
  });
  it('deduplicates same-origin links and ignores external and logout actions', () => {
    const { discoverLinks } = require('../../../scripts/production-health.cjs');
    expect(discoverLinks('<a href="/schedule">a</a><a href="/schedule">b</a><a href="https://evil.test">c</a><a href="/api/auth/signout">d</a>')).toEqual(['/schedule']);
  });
});

describe('instructor approval safety', () => {
  it('preserves historical legacy selections without forcing a pay-history reassignment', () => {
    const source = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/page.tsx', 'utf8');
    expect(source).toContain("required={item.status === 'SCHEDULED' && item.endAt > new Date()}");
    expect(source).toContain('Historical assignment');
    expect(source).toContain('value={item.instructorId}');
  });
  it('requires a login-capable applicant and never automatically moves financial or historical ownership by name', () => {
    const source = readFileSync('app/(studio)/admin/instructors/actions.ts', 'utf8').split('export async function approveInstructorAction')[1];
    expect(source).toContain("application.user.status !== 'ACTIVE'");
    expect(source).toContain('!application.user.passwordHash');
    expect(source).toContain("email: { endsWith: '@rhyze.local', mode: 'insensitive' }");
    expect(source).toContain("status: 'SCHEDULED', startAt: { gte: new Date() }");
    expect(source).not.toContain('tx.referralCommission.updateMany');
    expect(source).not.toContain('tx.referralCode.updateMany');
  });
});

describe('legacy schedule writer safety', () => {
  for (const file of ['scripts/sync-owned-catalog.ts', 'prisma/seed.ts', 'scripts/apply-september-2026-preview.ts']) {
    it(`${file} refuses nonlocal database before writes`, () => {
      const source = readFileSync(file, 'utf8');
      expect(source).toContain('assertLocalDatabase(process.env.DATABASE_URL)');
      expect(source.indexOf('assertLocalDatabase(process.env.DATABASE_URL)')).toBeLessThan(source.indexOf('const prisma = new PrismaClient()'));
    });
  }
  it('requires explicit local database hostname and blocks hosted databases even with localhost app URL', async () => {
    const { assertLocalDatabase } = await import('../../../lib/import/local-database-only');
    expect(() => assertLocalDatabase('postgresql://u:p@localhost:5432/preview')).not.toThrow();
    expect(() => assertLocalDatabase('postgresql://u:p@db.neon.tech/production')).toThrow();
    expect(() => assertLocalDatabase(undefined)).toThrow();
  });
});
