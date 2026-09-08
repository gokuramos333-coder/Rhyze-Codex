import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ADMIN client membership surface', () => {
  it('shows start controls only when no qualifying membership exists', () => {
    const page = readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');
    expect(page).toContain('hasQualifyingMembership');
    expect(page).toContain('{!hasQualifyingMembership && (');
    expect(page).toContain('<AdminMembershipStartForm');
    expect(page).toContain('startAdminMembershipCheckoutAction');
    expect(page).toContain('assignAdminMembershipAction');
  });

  it('visually distinguishes Stripe purchase from no-charge assignment', () => {
    const source = readFileSync('components/admin/AdminMembershipStartForm.tsx', 'utf8');
    expect(source).toContain('PURCHASE THROUGH STRIPE');
    expect(source).toContain('ASSIGN WITHOUT CHARGING');
    expect(source).toContain('Card details stay on Stripe');
    expect(source).toContain('does not charge or auto-renew');
    expect(source).toContain('name="accessEndDate"');
    expect(source).toContain('name="reason"');
  });

  it('explains every client-creation and membership-start result', () => {
    const page = readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');

    expect(page).toContain("searchParams.sent === 'client-created'");
    expect(page).toContain("searchParams.membership === 'success'");
    expect(page).toContain("searchParams.membership === 'cancelled'");
    expect(page).toContain("searchParams.membership === 'checkout-error'");
    expect(page).toContain("searchParams.membership === 'assigned'");
    expect(page).toContain("searchParams.membership === 'assignment-invalid'");
    expect(page).toContain("searchParams.membership === 'assignment-error'");
  });
});
