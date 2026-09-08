import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('forgot-password account recovery surface', () => {
  it('sends invited members without passwords through account activation instead of silently doing nothing', () => {
    const source = readFileSync('app/(auth)/actions.ts', 'utf8');

    expect(source).toContain('issueAccountClaim(invitedUser.id');
    expect(source).toContain("template: 'ACCOUNT_ACTIVATION'");
    expect(source).toContain("invitedUser.status === 'INVITED'");
    expect(source).toContain('!invitedUser.passwordHash');
    expect(source).toContain("template: 'PASSWORD_RESET'");
  });
});
