import { prisma } from '@/lib/db/prisma';
import type { AccountClaimRepository } from './account-claim-service';

export const prismaAccountClaimRepository: AccountClaimRepository = {
  findEligibleUserById(userId) {
    return prisma.user.findFirst({
      where: {
        id: userId,
        OR: [
          {
            role: 'MEMBER',
            status: 'INVITED',
            passwordHash: null,
          },
          {
            role: 'OWNER',
            status: 'ACTIVE',
          },
        ],
      },
      select: { id: true, email: true },
    });
  },
  async replaceToken(input) {
    await prisma.$transaction([
      prisma.accountClaimToken.deleteMany({
        where: { userId: input.userId, usedAt: null },
      }),
      prisma.accountClaimToken.create({ data: input }),
    ]);
  },
  findTokenByHash(tokenHash) {
    return prisma.accountClaimToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { email: true } },
      },
    }).then((token) => token && ({
      id: token.id,
      userId: token.userId,
      email: token.user.email,
      expiresAt: token.expiresAt,
      usedAt: token.usedAt,
    }));
  },
  async consumeClaim(input) {
    await prisma.$transaction([
      prisma.user.update({
        where: {
          id: input.userId,
          OR: [
            { role: 'MEMBER', status: 'INVITED', passwordHash: null },
            { role: 'OWNER', status: 'ACTIVE' },
          ],
        },
        data: { status: 'ACTIVE', passwordHash: input.passwordHash },
      }),
      prisma.memberProfile.upsert({
        where: { userId: input.userId },
        update: { dateOfBirth: input.dateOfBirth },
        create: { userId: input.userId, dateOfBirth: input.dateOfBirth },
      }),
      prisma.waiverAcceptance.upsert({
        where: {
          waiverVersionId_userId: {
            waiverVersionId: input.waiverVersionId,
            userId: input.userId,
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
          userId: input.userId,
          signedDate: input.usedAt,
          mediaConsent: input.mediaConsent,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      }),
      prisma.accountClaimToken.update({
        where: { id: input.tokenId, usedAt: null },
        data: { usedAt: input.usedAt },
      }),
      prisma.auditLog.create({
        data: {
          actorId: input.userId,
          action: 'account.claimed',
          entityType: 'User',
          entityId: input.userId,
        },
      }),
    ]);
  },
};
