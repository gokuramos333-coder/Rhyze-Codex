import { describe, expect, it } from 'vitest';
import { approvedOwnerEmails, isApprovedOwner } from '@/lib/auth/owner-access';

describe('owner-only ADMIN access', () => {
  it.each([
    'vanessa@rhyzefit.com',
    'melissa@rhyzefit.com',
    'automation-admin@rhyze.local',
    ' Vanessa@RhyzeFit.com ',
  ])('allows active approved OWNER account %s', (email) => {
    expect(
      isApprovedOwner({ email, role: 'OWNER', status: 'ACTIVE' }),
    ).toBe(true);
  });

  it.each([
    { email: 'someone@rhyzefit.com', role: 'OWNER', status: 'ACTIVE' },
    { email: 'vanessa@rhyzefit.com', role: 'ADMIN', status: 'ACTIVE' },
    { email: 'melissa@rhyzefit.com', role: 'MANAGER', status: 'ACTIVE' },
    { email: 'vanessa@rhyzefit.com', role: 'OWNER', status: 'INVITED' },
    { email: 'melissa@rhyzefit.com', role: 'OWNER', status: 'SUSPENDED' },
  ] as const)('rejects non-owner access for $email/$role/$status', (input) => {
    expect(isApprovedOwner(input)).toBe(false);
  });

  it('does not send operational owner notifications to the automation account', () => {
    expect(approvedOwnerEmails()).not.toContain('automation-admin@rhyze.local');
  });
});
