import { hashPassword, validatePassword } from '@/lib/auth/password';
import {
  createSecureToken,
  hashToken,
  isTokenUsable,
} from '@/lib/auth/tokens';
import { InvalidPasswordError } from './account-service';

export type ResetTokenRecord = {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export type PasswordResetRepository = {
  findActiveUserByEmail(email: string): Promise<{ id: string } | null>;
  replaceToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findTokenByHash(tokenHash: string): Promise<ResetTokenRecord | null>;
  consumeToken(input: {
    tokenId: string;
    userId: string;
    passwordHash: string;
    usedAt: Date;
  }): Promise<void>;
};

export async function requestPasswordReset(
  emailInput: string,
  repository: PasswordResetRepository,
  now = new Date(),
): Promise<string | null> {
  const email = emailInput.trim().toLowerCase();
  const user = await repository.findActiveUserByEmail(email);
  if (!user) return null;

  const { token, tokenHash } = createSecureToken();
  await repository.replaceToken({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
  });

  return token;
}

export async function resetPassword(
  presentedToken: string,
  password: string,
  repository: PasswordResetRepository,
  now = new Date(),
): Promise<{ userId: string }> {
  const validation = validatePassword(password);
  if (!validation.valid) {
    throw new InvalidPasswordError(validation.errors);
  }

  const token = await repository.findTokenByHash(hashToken(presentedToken));
  if (!token || !isTokenUsable(token, now)) {
    throw new Error('The reset link is invalid or expired.');
  }

  await repository.consumeToken({
    tokenId: token.id,
    userId: token.userId,
    passwordHash: await hashPassword(password),
    usedAt: now,
  });

  return { userId: token.userId };
}
