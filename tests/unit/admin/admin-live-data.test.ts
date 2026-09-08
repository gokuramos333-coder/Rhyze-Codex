import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin live data rendering', () => {
  it('forces every admin page to render from current database state', () => {
    const layout = readFileSync('app/(studio)/admin/layout.tsx', 'utf8');

    expect(layout).toContain("export const dynamic = 'force-dynamic'");
    expect(layout).toContain('export const revalidate = 0');
  });

  it('does not count expired intro-trial memberships or stale unlimited trial credits as active on member admin', () => {
    const memberAdmin = readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');

    expect(memberAdmin).toContain("import { introTrialIsExpired } from '@/lib/domain/memberships/membership-display'");
    expect(memberAdmin).toContain('const activeMemberships = member.memberships.filter');
    expect(memberAdmin).toContain("membership.product.kind !== 'INTRO_TRIAL'");
    expect(memberAdmin).toContain("account.sourcePurchase?.product.kind === 'INTRO_TRIAL'");
    expect(memberAdmin).toContain('return false;');
    expect(memberAdmin).toContain('value={`${activeMemberships.filter');
  });
});
