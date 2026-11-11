import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('client page wires owner-only pending saved offer and cancellation result without replacing checkout',()=>{
  const page=readFileSync('app/(studio)/admin/members/[userId]/page.tsx','utf8');
  expect(page).toContain('<PendingMembershipCheckout');
  expect(page).toContain('action={cancelAdminMembershipCheckoutAction}');
  expect(page).toContain("membership === 'checkout-cancelled'");
  expect(page).toContain("membership === 'checkout-review'");
  expect(page).toContain("isApprovedOwner({ ...actor, status: 'ACTIVE' })");
});
