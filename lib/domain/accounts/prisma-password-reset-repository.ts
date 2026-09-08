import type { PasswordResetRepository } from './password-reset-service';
import { prisma } from '@/lib/db/prisma';

export const prismaPasswordResetRepository: PasswordResetRepository = {
  findActiveUserByEmail(email) {
    return prisma.user.findFirst({
      where: { email, status: 'ACTIVE' },
      select: { id: true },
    });
  },
  async replaceToken(input) {
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({
        where: { userId: input.userId, usedAt: null },
      }),
      prisma.passwordResetToken.create({
        data: input,
      }),
    ]);
  },
  findTokenByHash(tokenHash) {
    return prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
      },
    });
  },
  async consumeToken(input) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: input.userId },
        data: {
          passwordHash: input.passwordHash,
          credentialsUpdatedAt: input.usedAt,
        },
      }),
      prisma.passwordResetToken.update({
        where: { id: input.tokenId },
        data: { usedAt: input.usedAt },
      }),
      prisma.session.deleteMany({ where: { userId: input.userId } }),
      prisma.auditLog.create({
        data: {
          actorId: input.userId,
          action: 'account.password.reset',
          entityType: 'User',
          entityId: input.userId,
        },
      }),
    ]);
  },
};
