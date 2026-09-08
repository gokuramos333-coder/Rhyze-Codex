import { prisma } from '@/lib/db/prisma';
import type { PasswordChangeRepository } from './password-change-service';

export const prismaPasswordChangeRepository: PasswordChangeRepository = {
  findCredential(userId) {
    return prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE', passwordHash: { not: null } },
      select: { passwordHash: true },
    }).then((user) => user?.passwordHash ? { passwordHash: user.passwordHash } : null);
  },
  async updatePassword(input) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: input.userId },
        data: { passwordHash: input.passwordHash },
      }),
      prisma.auditLog.create({
        data: {
          actorId: input.userId,
          action: 'account.password.changed',
          entityType: 'User',
          entityId: input.userId,
          after: { changedAt: input.changedAt.toISOString() },
        },
      }),
    ]);
  },
};
