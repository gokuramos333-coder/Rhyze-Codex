import type { PrismaClient } from '@prisma/client';
import type { PasswordResetRepository } from './password-reset-service';
import { prisma } from '@/lib/db/prisma';
import {
  accountTokenMatchesUser,
  accountTokenSnapshot,
  withAccountTokenLock,
} from './account-token-security';
import { isTokenUsable } from '@/lib/auth/tokens';

export function createPasswordResetRepository(
  client: PrismaClient,
): PasswordResetRepository {
  return {
    async findActiveUserByEmail(email) {
      const user = await client.user.findFirst({
        where: { email, status: 'ACTIVE' },
      });
      return (
        user && {
          id: user.id,
          email: user.email,
          credentialFingerprint:
            accountTokenSnapshot(user).credentialFingerprint,
        }
      );
    },
    replaceToken(input) {
      return withAccountTokenLock(client, input.userId, async (tx) => {
        const user = await tx.user.findUnique({ where: { id: input.userId } });
        if (
          !user ||
          user.status !== 'ACTIVE' ||
          !accountTokenMatchesUser(input, user)
        )
          return false;
        await tx.passwordResetToken.deleteMany({
          where: { userId: user.id, usedAt: null },
        });
        await tx.passwordResetToken.create({ data: input });
        return true;
      });
    },
    async findTokenByHash(tokenHash) {
      const token = await client.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      return token && accountTokenMatchesUser(token, token.user) ? token : null;
    },
    async consumeToken(input) {
      await withAccountTokenLock(client, input.userId, async (tx) => {
        const user = await tx.user.findUnique({ where: { id: input.userId } });
        const token = await tx.passwordResetToken.findUnique({
          where: { id: input.tokenId },
        });
        if (
          !user ||
          user.status !== 'ACTIVE' ||
          !token ||
          token.userId !== user.id ||
          !isTokenUsable(token, input.usedAt) ||
          !accountTokenMatchesUser(token, user)
        )
          throw new Error('The reset link is invalid or expired.');
        await tx.passwordResetToken.update({
          where: { id: token.id, usedAt: null },
          data: { usedAt: input.usedAt },
        });
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash: input.passwordHash,
            credentialsUpdatedAt: input.usedAt,
          },
        });
        await tx.passwordResetToken.deleteMany({
          where: { userId: user.id, id: { not: token.id } },
        });
        await tx.accountClaimToken.deleteMany({ where: { userId: user.id } });
        await tx.accountEmailChangeToken.deleteMany({
          where: { userId: user.id },
        });
        await tx.session.deleteMany({ where: { userId: user.id } });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'account.password.reset',
            entityType: 'User',
            entityId: user.id,
          },
        });
      });
    },
  };
}
export const prismaPasswordResetRepository =
  createPasswordResetRepository(prisma);
