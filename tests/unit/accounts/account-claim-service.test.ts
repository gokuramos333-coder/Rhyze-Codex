import { describe, expect, it } from 'vitest';
import {
  AccountClaimError,
  claimImportedAccount,
  issueAccountClaim,
  type AccountClaimRepository,
  type AccountClaimTokenRecord,
} from '@/lib/domain/accounts/account-claim-service';

const NOW = new Date('2026-07-27T16:00:00.000Z');

function repository(options?: { eligible?: boolean }): AccountClaimRepository & {
  stored: AccountClaimTokenRecord | null;
  storedHash: string | null;
  activated: Array<{
    userId: string;
    tokenId: string;
    passwordHash: string;
    dateOfBirth: Date;
    waiverVersionId: string;
    mediaConsent: boolean;
  }>;
  userCount: number;
} {
  const repo = {
    stored: null as AccountClaimTokenRecord | null,
    storedHash: null as string | null,
    activated: [] as Array<{
      userId: string;
      tokenId: string;
      passwordHash: string;
      dateOfBirth: Date;
      waiverVersionId: string;
      mediaConsent: boolean;
    }>,
    userCount: 1,
    async findEligibleUserById(userId: string) {
      return options?.eligible === false
        ? null
        : { id: userId, email: 'member@example.com' };
    },
    async replaceToken(input: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
    }) {
      repo.storedHash = input.tokenHash;
      repo.stored = {
        id: 'claim-token-1',
        userId: input.userId,
        email: 'member@example.com',
        expiresAt: input.expiresAt,
        usedAt: null,
      };
    },
    async findTokenByHash(tokenHash: string) {
      return tokenHash === repo.storedHash ? repo.stored : null;
    },
    async consumeClaim(input: {
      tokenId: string;
      userId: string;
      passwordHash: string;
      dateOfBirth: Date;
      waiverVersionId: string;
      mediaConsent: boolean;
      usedAt: Date;
    }) {
      repo.activated.push(input);
      if (repo.stored) repo.stored = { ...repo.stored, usedAt: input.usedAt };
    },
  };
  return repo;
}

describe('invited account claims', () => {
  it('issues a hashed one-time token that expires after 30 days', async () => {
    const repo = repository();

    const claim = await issueAccountClaim('member-1', repo, NOW);

    expect(claim.rawToken).toHaveLength(43);
    expect(repo.storedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repo.storedHash).not.toContain(claim.rawToken);
    expect(claim.expiresAt.toISOString()).toBe('2026-08-26T16:00:00.000Z');
  });

  it('does not issue a claim for a user who is not an eligible invite', async () => {
    const repo = repository({ eligible: false });

    await expect(issueAccountClaim('active-member', repo, NOW)).rejects.toBeInstanceOf(
      AccountClaimError,
    );
    expect(repo.stored).toBeNull();
  });

  it('activates the existing invited user without creating a duplicate', async () => {
    const repo = repository();
    const claim = await issueAccountClaim('member-1', repo, NOW);

    const result = await claimImportedAccount(
      claim.rawToken,
      'SecurePass1!',
      new Date('2000-04-12T12:00:00.000Z'),
      true,
      'waiver-current',
      repo,
      true,
      undefined,
      NOW,
    );

    expect(result).toEqual({ userId: 'member-1', email: 'member@example.com' });
    expect(repo.userCount).toBe(1);
    expect(repo.activated).toHaveLength(1);
    expect(repo.activated[0]).toMatchObject({
      tokenId: 'claim-token-1',
      userId: 'member-1',
      usedAt: NOW,
      dateOfBirth: new Date('2000-04-12T12:00:00.000Z'),
      waiverVersionId: 'waiver-current',
      mediaConsent: true,
    });
    expect(repo.activated[0].passwordHash).not.toContain('SecurePass1!');
  });

  it('rejects expired, reused, unknown, and weak-password claims', async () => {
    const expiredRepo = repository();
    const expired = await issueAccountClaim('member-1', expiredRepo, NOW);
    await expect(
      claimImportedAccount(
        expired.rawToken,
        'SecurePass1!',
        new Date('2000-04-12T12:00:00.000Z'),
        true,
        'waiver-current',
        expiredRepo,
        undefined,
        undefined,
        new Date('2026-08-26T16:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(AccountClaimError);

    const reusedRepo = repository();
    const reused = await issueAccountClaim('member-1', reusedRepo, NOW);
    await claimImportedAccount(
      reused.rawToken,
      'SecurePass1!',
      new Date('2000-04-12T12:00:00.000Z'),
      true,
      'waiver-current',
      reusedRepo,
      undefined,
      undefined,
      NOW,
    );
    await expect(
      claimImportedAccount(
        reused.rawToken,
        'SecurePass1!',
        new Date('2000-04-12T12:00:00.000Z'),
        true,
        'waiver-current',
        reusedRepo,
        undefined,
        undefined,
        NOW,
      ),
    ).rejects.toBeInstanceOf(AccountClaimError);

    const unknownRepo = repository();
    await expect(
      claimImportedAccount(
        'unknown-token',
        'SecurePass1!',
        new Date('2000-04-12T12:00:00.000Z'),
        true,
        'waiver-current',
        unknownRepo,
        undefined,
        undefined,
        NOW,
      ),
    ).rejects.toBeInstanceOf(AccountClaimError);

    const weakRepo = repository();
    const weak = await issueAccountClaim('member-1', weakRepo, NOW);
    await expect(
      claimImportedAccount(
        weak.rawToken,
        'weak',
        new Date('2000-04-12T12:00:00.000Z'),
        true,
        'waiver-current',
        weakRepo,
        undefined,
        undefined,
        NOW,
      ),
    ).rejects.toThrow('Use at least 9 characters.');
    expect(weakRepo.activated).toHaveLength(0);
  });
});
