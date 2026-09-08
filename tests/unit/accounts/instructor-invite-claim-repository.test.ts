import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('instructor invite account activation', () => {
  it('allows any invited member without a password to claim their account', () => {
    const source = readFileSync(
      'lib/domain/accounts/prisma-account-claim-repository.ts',
      'utf8',
    );

    expect(source).toContain("role: 'MEMBER'");
    expect(source).toContain("status: 'INVITED'");
    expect(source).toContain('passwordHash: null');
    expect(source).not.toContain('sombleClientProfile: { isNot: null }');
  });
});
