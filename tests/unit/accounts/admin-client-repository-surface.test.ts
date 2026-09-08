import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Prisma admin client repository', () => {
  it('creates an invited member with profile, notification defaults, activation, email, and audit', () => {
    const source = readFileSync('lib/domain/accounts/prisma-admin-client-repository.ts', 'utf8');

    expect(source).toContain("status: 'INVITED'");
    expect(source).toContain("role: 'MEMBER'");
    expect(source).toContain('memberProfile: { create:');
    expect(source).toContain('notificationPreference: { create:');
    expect(source).toContain('accountClaimToken.create');
    expect(source).toContain("template: 'ADMIN_CLIENT_INVITATION'");
    expect(source).toContain("action: 'admin.client-created'");
    expect(source).not.toContain('passwordHash:');
    expect(source).not.toContain('waiverAcceptances:');
  });
});
