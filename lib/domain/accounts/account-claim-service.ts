import { hashPassword, validatePassword } from '@/lib/auth/password';
import {
  createSecureToken,
  hashToken,
  isTokenUsable,
} from '@/lib/auth/tokens';
import { AgreementRequiredError, InvalidPasswordError } from './account-service';

const ACCOUNT_CLAIM_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export class AccountClaimError extends Error {}

export type AccountClaimTokenRecord = {
  id: string;
  userId: string;
  email: string;
  expiresAt: Date;
  usedAt: Date | null;
};

export type AccountClaimRepository = {
  findEligibleUserById(userId: string): Promise<{ id: string; email: string } | null>;
  replaceToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findTokenByHash(tokenHash: string): Promise<AccountClaimTokenRecord | null>;
  consumeClaim(input: {
    tokenId: string;
    userId: string;
    passwordHash: string;
    dateOfBirth: Date;
    waiverVersionId: string;
    mediaConsent: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
    usedAt: Date;
  }): Promise<void>;
};

export async function issueAccountClaim(
  userId: string,
  repository: AccountClaimRepository,
  now = new Date(),
): Promise<{ rawToken: string; expiresAt: Date }> {
  const user = await repository.findEligibleUserById(userId);
  if (!user) throw new AccountClaimError('This account cannot be activated.');

  const { token, tokenHash } = createSecureToken();
  const expiresAt = new Date(now.getTime() + ACCOUNT_CLAIM_LIFETIME_MS);
  await repository.replaceToken({ userId: user.id, tokenHash, expiresAt });

  return { rawToken: token, expiresAt };
}

export async function claimImportedAccount(
  presentedToken: string,
  password: string,
  dateOfBirth: Date,
  waiverAccepted: boolean,
  waiverVersionId: string,
  repository: AccountClaimRepository,
  mediaConsent = false,
  requestMetadata?: { ipAddress?: string | null; userAgent?: string | null },
  now = new Date(),
): Promise<{ userId: string; email: string }> {
  const validation = validatePassword(password);
  if (!validation.valid) throw new InvalidPasswordError(validation.errors);
  if (!waiverAccepted || !waiverVersionId) throw new AgreementRequiredError();

  const token = await repository.findTokenByHash(hashToken(presentedToken));
  if (!token || !isTokenUsable(token, now)) {
    throw new AccountClaimError('This activation link is invalid or expired.');
  }

  await repository.consumeClaim({
    tokenId: token.id,
    userId: token.userId,
    passwordHash: await hashPassword(password),
    dateOfBirth,
    waiverVersionId,
    mediaConsent,
    ipAddress: requestMetadata?.ipAddress,
    userAgent: requestMetadata?.userAgent,
    usedAt: now,
  });

  return { userId: token.userId, email: token.email };
}
