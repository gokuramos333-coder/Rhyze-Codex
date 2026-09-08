import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from '@/lib/auth/password';

export type PasswordChangeErrorCode =
  | 'ACCOUNT'
  | 'CURRENT_PASSWORD'
  | 'MISMATCH'
  | 'NEW_PASSWORD';

export class PasswordChangeError extends Error {
  constructor(
    public readonly code: PasswordChangeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type PasswordChangeRepository = {
  findCredential(userId: string): Promise<{ passwordHash: string } | null>;
  updatePassword(input: {
    userId: string;
    passwordHash: string;
    changedAt: Date;
  }): Promise<void>;
};

export async function changePassword(
  input: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    passwordConfirmation: string;
  },
  repository: PasswordChangeRepository,
  now = new Date(),
): Promise<void> {
  const credential = await repository.findCredential(input.userId);
  if (!credential) {
    throw new PasswordChangeError('ACCOUNT', 'This account cannot change its password here.');
  }

  if (!(await verifyPassword(credential.passwordHash, input.currentPassword))) {
    throw new PasswordChangeError('CURRENT_PASSWORD', 'The current password is incorrect.');
  }

  if (input.newPassword !== input.passwordConfirmation) {
    throw new PasswordChangeError('MISMATCH', 'The new passwords do not match.');
  }

  const validation = validatePassword(input.newPassword);
  if (!validation.valid) {
    throw new PasswordChangeError('NEW_PASSWORD', validation.errors.join(' '));
  }

  await repository.updatePassword({
    userId: input.userId,
    passwordHash: await hashPassword(input.newPassword),
    changedAt: now,
  });
}
