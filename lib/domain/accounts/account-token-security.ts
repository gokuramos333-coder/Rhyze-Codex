import type { Prisma, PrismaClient } from '@prisma/client';
import { hashToken } from '@/lib/auth/tokens';

type Identity = {
  email: string;
  passwordHash: string | null;
  credentialsUpdatedAt: Date | null;
  role: string;
  status: string;
};
export function accountTokenSnapshot(user: Identity) {
  return {
    emailSnapshot: user.email,
    credentialFingerprint: hashToken(
      `${user.passwordHash ?? ''}:${user.credentialsUpdatedAt?.toISOString() ?? ''}:${user.role}:${user.status}`,
    ),
  };
}
export function accountTokenMatchesUser(
  token: { emailSnapshot: string | null; credentialFingerprint: string | null },
  user: Identity,
) {
  const snapshot = accountTokenSnapshot(user);
  return (
    token.emailSnapshot === snapshot.emailSnapshot &&
    token.credentialFingerprint === snapshot.credentialFingerprint
  );
}
export async function withAccountTokenLock<T>(
  client: PrismaClient,
  userId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    return work(tx);
  });
}
