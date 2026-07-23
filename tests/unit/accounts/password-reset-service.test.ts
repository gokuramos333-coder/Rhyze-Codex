import { describe, expect, it } from 'vitest';
import {
  requestPasswordReset,
  resetPassword,
  type PasswordResetRepository,
} from '@/lib/domain/accounts/password-reset-service';

function repository(userId: string | null): PasswordResetRepository & {
  saved: Array<{ userId: string; tokenHash: string; expiresAt: Date }>;
} {
  const saved: Array<{
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }> = [];

  return {
    saved,
    async findActiveUserByEmail() {
      return userId ? { id: userId } : null;
    },
    async replaceToken(input) {
      saved.push(input);
    },
    async findTokenByHash() {
      return null;
    },
    async consumeToken() {},
  };
}

describe('requestPasswordReset', () => {
  it('creates a hashed, one-hour token for an active account', async () => {
    const repo = repository('member-1');
    const now = new Date('2026-07-23T15:00:00.000Z');

    const token = await requestPasswordReset(
      ' MEMBER@example.com ',
      repo,
      now,
    );

    expect(token).toBeTypeOf('string');
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0].tokenHash).not.toBe(token);
    expect(repo.saved[0].expiresAt.toISOString()).toBe(
      '2026-07-23T16:00:00.000Z',
    );
  });

  it('returns the same public result without writing for an unknown email', async () => {
    const repo = repository(null);

    expect(
      await requestPasswordReset('unknown@example.com', repo),
    ).toBeNull();
    expect(repo.saved).toHaveLength(0);
  });
});

describe('resetPassword', () => {
  it('replaces the password and consumes a valid token', async () => {
    let consumed = false;
    const repo = repository(null);
    repo.findTokenByHash = async () => ({
      id: 'reset-1',
      userId: 'member-1',
      expiresAt: new Date('2026-07-23T16:00:00.000Z'),
      usedAt: null,
    });
    repo.consumeToken = async ({ passwordHash }) => {
      expect(passwordHash).not.toContain('Rhyze!NewPass2026');
      consumed = true;
    };

    await resetPassword(
      'presented-token',
      'Rhyze!NewPass2026',
      repo,
      new Date('2026-07-23T15:00:00.000Z'),
    );

    expect(consumed).toBe(true);
  });

  it('rejects an expired token without changing a password', async () => {
    const repo = repository(null);
    repo.findTokenByHash = async () => ({
      id: 'reset-1',
      userId: 'member-1',
      expiresAt: new Date('2026-07-23T14:59:59.000Z'),
      usedAt: null,
    });

    await expect(
      resetPassword(
        'presented-token',
        'Rhyze!NewPass2026',
        repo,
        new Date('2026-07-23T15:00:00.000Z'),
      ),
    ).rejects.toThrow('reset link is invalid or expired');
  });
});
