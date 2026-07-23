import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSecureToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function tokensMatch(presentedToken: string, tokenHash: string): boolean {
  const presentedHash = Buffer.from(hashToken(presentedToken), 'hex');
  const storedHash = Buffer.from(tokenHash, 'hex');

  return (
    presentedHash.length === storedHash.length &&
    timingSafeEqual(presentedHash, storedHash)
  );
}

export function isTokenUsable(
  token: { expiresAt: Date; usedAt: Date | null },
  now = new Date(),
): boolean {
  return token.usedAt === null && token.expiresAt.getTime() > now.getTime();
}
