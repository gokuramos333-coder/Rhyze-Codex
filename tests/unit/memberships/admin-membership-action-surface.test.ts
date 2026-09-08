import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin membership actions', () => {
  it('authorizes owners and locks assignment per client before checking current access', () => {
    const source = readFileSync('app/(studio)/admin/members/[userId]/actions.ts', 'utf8');
    expect(source).toContain('startAdminMembershipCheckoutAction');
    expect(source).toContain('assignAdminMembershipAction');
    expect(source).toContain('requireApprovedOwner()');
    expect(source).toContain('pg_advisory_xact_lock');
    expect(source).toContain('qualifyingMembershipWhere');
    expect(source).toContain('sourcePurchaseId: purchase.id');
    expect(source).toContain("action: 'admin.membership-assigned'");
    expect(source).toContain("template: 'ADMIN_MEMBERSHIP_ASSIGNED'");
  });
});
