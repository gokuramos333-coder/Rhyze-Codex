import { describe, expect, it } from 'vitest';
import {
  requestPasswordReset,
  resetPassword,
  type PasswordResetRepository,
  type ResetTokenRecord,
} from '@/lib/domain/accounts/password-reset-service';

const NOW = new Date('2026-07-27T17:00:00.000Z');

function repository(options?: { active?: boolean }): PasswordResetRepository & {
  token: ResetTokenRecord | null;
  tokenHash: string | null;
  consumed: Array<{ tokenId: string; userId: string; passwordHash: string; usedAt: Date }>;
} {
  const repo = {
    token: null as ResetTokenRecord | null,
    tokenHash: null as string | null,
    consumed: [] as Array<{
      tokenId: string;
      userId: string;
      passwordHash: string;
      usedAt: Date;
    }>,
    async findActiveUserByEmail() {
      return options?.active === false ? null : { id: 'member-1' };
    },
    async replaceToken(input: { userId: string; tokenHash: string; expiresAt: Date }) {
      repo.tokenHash = input.tokenHash;
      repo.token = {
        id: 'reset-token-1',
        userId: input.userId,
        expiresAt: input.expiresAt,
        usedAt: null,
        createdAt: NOW,
      };
    },
    async findTokenByHash(tokenHash: string) {
      return tokenHash === repo.tokenHash ? repo.token : null;
    },
    async consumeToken(input: {
      tokenId: string;
      userId: string;
      passwordHash: string;
      usedAt: Date;
    }) {
      repo.consumed.push(input);
      if (repo.token) repo.token = { ...repo.token, usedAt: input.usedAt };
    },
  };
  return repo;
}

describe('forgot-password recovery', () => {
  it('issues a hashed reset token that expires after one hour', async () => {
    const repo = repository();

    const token = await requestPasswordReset(' MEMBER@example.com ', repo, NOW);

    expect(token).toHaveLength(43);
    expect(repo.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repo.tokenHash).not.toContain(token!);
    expect(repo.token?.expiresAt.toISOString()).toBe('2026-07-27T18:00:00.000Z');
  });

  it('returns the same null result for an unknown or inactive account', async () => {
    const repo = repository({ active: false });

    await expect(requestPasswordReset('missing@example.com', repo, NOW)).resolves.toBeNull();
    expect(repo.token).toBeNull();
  });

  it('always issues a fresh reset token when a member asks again', async () => {
    const repo = repository();
    const first = await requestPasswordReset('member@example.com', repo, NOW);

    const second = await requestPasswordReset(
      'member@example.com',
      repo,
      new Date('2026-07-27T17:04:59.999Z'),
    );

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(repo.token?.expiresAt.toISOString()).toBe('2026-07-27T18:04:59.999Z');
  });

  it('accepts a strong password once and rejects weak, expired, reused, or unknown tokens', async () => {
    const repo = repository();
    const token = await requestPasswordReset('member@example.com', repo, NOW);

    await expect(resetPassword(token!, 'weak', repo, NOW)).rejects.toThrow(
      'Use at least 9 characters.',
    );
    await resetPassword(token!, 'NewSecure1!', repo, NOW);
    expect(repo.consumed).toHaveLength(1);
    expect(repo.consumed[0].passwordHash).not.toContain('NewSecure1!');
    await expect(resetPassword(token!, 'NewSecure1!', repo, NOW)).rejects.toThrow(
      'invalid or expired',
    );

    const expiredRepo = repository();
    const expired = await requestPasswordReset('member@example.com', expiredRepo, NOW);
    await expect(
      resetPassword(
        expired!,
        'NewSecure1!',
        expiredRepo,
        new Date('2026-07-27T18:00:00.000Z'),
      ),
    ).rejects.toThrow('invalid or expired');

    await expect(
      resetPassword('unknown', 'NewSecure1!', repository(), NOW),
    ).rejects.toThrow('invalid or expired');
  });
});
