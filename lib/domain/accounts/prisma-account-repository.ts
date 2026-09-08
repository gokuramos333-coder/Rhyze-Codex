import type { AccountRepository } from './account-service';
import { prisma } from '@/lib/db/prisma';

export const prismaAccountRepository: AccountRepository = {
  findByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
  },
  createMember(input) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: input.passwordHash,
          memberProfile: { create: { phone: input.phone, dateOfBirth: input.dateOfBirth } },
          notificationPreference: { create: { marketingEmail: true } },
          waiverAcceptances: {
            create: {
              waiverVersionId: input.waiverVersionId,
              signedDate: new Date(),
              mediaConsent: input.mediaConsent,
              ipAddress: input.ipAddress,
              userAgent: input.userAgent,
            },
          },
        },
        select: {
          id: true,
          email: true,
        },
      });
      return user;
    });
  },
};
