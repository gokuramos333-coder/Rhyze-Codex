import { describe, expect, it } from 'vitest';
import { isApprovedOwner } from '@/lib/auth/owner-access';

describe('owner-only ADMIN access', () => {
  it.each([
    'vanessa@rhyzefit.com',
    'vxnessaramos@gmail.com',
    'melissa@rhyzefit.com',
    'gui@westaffnj.com',
    ' Vanessa@RhyzeFit.com ',
  ])('allows active approved owner account %s', (email) => {
    expect(
      isApprovedOwner({ email, role: 'OWNER', status: 'ACTIVE' }),
    ).toBe(true);
  });

  it('allows Vanessa to keep her instructor login while accessing owner tools', () => {
    expect(
      isApprovedOwner({
        email: 'vxnessaramos@gmail.com',
        role: 'INSTRUCTOR',
        status: 'ACTIVE',
      }),
    ).toBe(true);
  });

  it.each([
    { email: 'someone@rhyzefit.com', role: 'OWNER', status: 'ACTIVE' },
    { email: 'vanessa@rhyzefit.com', role: 'OWNER', status: 'INVITED' },
    { email: 'melissa@rhyzefit.com', role: 'OWNER', status: 'SUSPENDED' },
  ] as const)('rejects non-owner access for $email/$role/$status', (input) => {
    expect(isApprovedOwner(input)).toBe(false);
  });
});
