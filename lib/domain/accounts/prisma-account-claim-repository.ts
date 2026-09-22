import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  AccountClaimError,
  type AccountClaimRepository,
} from './account-claim-service';
import {
  accountTokenMatchesUser,
  accountTokenSnapshot,
  withAccountTokenLock,
} from './account-token-security';
import { isTokenUsable } from '@/lib/auth/tokens';

const eligibility = {
  OR: [
    { role: 'MEMBER', status: 'INVITED', passwordHash: null },
    { role: 'OWNER', status: 'ACTIVE' },
  ],
} satisfies Prisma.UserWhereInput;

export function createAccountClaimRepository(
  client: PrismaClient,
): AccountClaimRepository {
  return {
    async findEligibleUserById(userId) {
      const user = await client.user.findFirst({
        where: { id: userId, ...eligibility },
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
        const user = await tx.user.findFirst({
          where: { id: input.userId, ...eligibility },
        });
        if (!user || !accountTokenMatchesUser(input, user)) return false;
        await tx.accountClaimToken.deleteMany({
          where: { userId: input.userId, usedAt: null },
        });
        await tx.accountClaimToken.create({ data: input });
        return true;
      });
    },
    async findTokenByHash(tokenHash) {
      const token = await client.accountClaimToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      return token && accountTokenMatchesUser(token, token.user)
        ? {
            id: token.id,
            userId: token.userId,
            email: token.emailSnapshot!,
            expiresAt: token.expiresAt,
            usedAt: token.usedAt,
          }
        : null;
    },
    async consumeClaim(input) {
      await withAccountTokenLock(client, input.userId, async (tx) => {
        const user = await tx.user.findFirst({
          where: { id: input.userId, ...eligibility },
        });
        const token = await tx.accountClaimToken.findUnique({
          where: { id: input.tokenId },
        });
        if (
          !user ||
          !token ||
          token.userId !== user.id ||
          !isTokenUsable(token, input.usedAt) ||
          !accountTokenMatchesUser(token, user)
        )
          throw new AccountClaimError(
            'This activation link is invalid or expired.',
          );
        await tx.accountClaimToken.update({
          where: { id: token.id, usedAt: null },
          data: { usedAt: input.usedAt },
        });
        await tx.user.update({
          where: { id: user.id },
          data: {
            status: 'ACTIVE',
            passwordHash: input.passwordHash,
            credentialsUpdatedAt: input.usedAt,
          },
        });
        await tx.memberProfile.upsert({
          where: { userId: user.id },
          update: { dateOfBirth: input.dateOfBirth },
          create: { userId: user.id, dateOfBirth: input.dateOfBirth },
        });
        await tx.waiverAcceptance.upsert({
          where: {
            waiverVersionId_userId: {
              waiverVersionId: input.waiverVersionId,
              userId: user.id,
            },
          },
          update: {
            signedDate: input.usedAt,
            mediaConsent: input.mediaConsent,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          },
          create: {
            waiverVersionId: input.waiverVersionId,
            userId: user.id,
            signedDate: input.usedAt,
            mediaConsent: input.mediaConsent,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          },
        });
        await tx.accountClaimToken.deleteMany({
          where: { userId: user.id, id: { not: token.id } },
        });
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.accountEmailChangeToken.deleteMany({
          where: { userId: user.id },
        });
        await tx.session.deleteMany({ where: { userId: user.id } });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'account.claimed',
            entityType: 'User',
            entityId: user.id,
          },
        });
      });
    },
  };
}
export const prismaAccountClaimRepository =
  createAccountClaimRepository(prisma);
