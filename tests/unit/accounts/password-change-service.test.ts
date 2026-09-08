import { describe, expect, it } from 'vitest';
import { hashPassword } from '@/lib/auth/password';
import {
  PasswordChangeError,
  changePassword,
  type PasswordChangeRepository,
} from '@/lib/domain/accounts/password-change-service';

async function repository(): Promise<PasswordChangeRepository & {
  updates: Array<{ userId: string; passwordHash: string; changedAt: Date }>;
  sessionsDeleted: number;
}> {
  const currentHash = await hashPassword('CurrentPass1!');
  const updates: Array<{ userId: string; passwordHash: string; changedAt: Date }> = [];
  return {
    updates,
    sessionsDeleted: 0,
    async findCredential(userId) {
      return userId === 'member-1' ? { passwordHash: currentHash } : null;
    },
    async updatePassword(input) {
      updates.push(input);
    },
  };
}

describe('logged-in password change', () => {
  it('requires the correct current password', async () => {
    const repo = await repository();

    await expect(
      changePassword(
        {
          userId: 'member-1',
          currentPassword: 'WrongPass1!',
          newPassword: 'NewSecure1!',
          passwordConfirmation: 'NewSecure1!',
        },
        repo,
      ),
    ).rejects.toMatchObject({ code: 'CURRENT_PASSWORD' });
    expect(repo.updates).toHaveLength(0);
  });

  it('requires matching strong new passwords', async () => {
    const repo = await repository();

    await expect(
      changePassword(
        {
          userId: 'member-1',
          currentPassword: 'CurrentPass1!',
          newPassword: 'NewSecure1!',
          passwordConfirmation: 'Different1!',
        },
        repo,
      ),
    ).rejects.toMatchObject({ code: 'MISMATCH' });

    await expect(
      changePassword(
        {
          userId: 'member-1',
          currentPassword: 'CurrentPass1!',
          newPassword: 'weak',
          passwordConfirmation: 'weak',
        },
        repo,
      ),
    ).rejects.toThrow('Use at least 9 characters.');
    expect(repo.updates).toHaveLength(0);
  });

  it('updates the password hash and preserves the current session', async () => {
    const repo = await repository();
    const changedAt = new Date('2026-07-27T18:00:00.000Z');

    await changePassword(
      {
        userId: 'member-1',
        currentPassword: 'CurrentPass1!',
        newPassword: 'NewSecure1!',
        passwordConfirmation: 'NewSecure1!',
      },
      repo,
      changedAt,
    );

    expect(repo.updates).toHaveLength(1);
    expect(repo.updates[0]).toMatchObject({ userId: 'member-1', changedAt });
    expect(repo.updates[0].passwordHash).not.toContain('NewSecure1!');
    expect(repo.sessionsDeleted).toBe(0);
  });

  it('rejects an account that does not have a local password', async () => {
    const repo = await repository();

    await expect(
      changePassword(
        {
          userId: 'missing',
          currentPassword: 'CurrentPass1!',
          newPassword: 'NewSecure1!',
          passwordConfirmation: 'NewSecure1!',
        },
        repo,
      ),
    ).rejects.toBeInstanceOf(PasswordChangeError);
  });
});
