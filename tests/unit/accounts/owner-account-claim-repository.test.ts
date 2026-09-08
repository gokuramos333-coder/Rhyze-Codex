import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('owner account activation eligibility', () => {
  it('allows active owners to take over an existing credential while preserving imported member rules', () => {
    const source = readFileSync(
      'lib/domain/accounts/prisma-account-claim-repository.ts',
      'utf8',
    );

    expect(source).toContain("role: 'OWNER'");
    expect(source).toContain("status: 'ACTIVE'");
    expect(source).toContain("role: 'MEMBER'");
    expect(source).toContain("status: 'INVITED'");
    expect(source).toContain('passwordHash: null');
    expect(source).toContain("{ role: 'OWNER', status: 'ACTIVE' }");
  });
});
