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
      const referral = input.referralCode
        ? await tx.referralCode.findFirst({ where: { code: input.referralCode, isActive: true } })
        : null;
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: input.passwordHash,
          memberProfile: { create: { phone: input.phone } },
          notificationPreference: { create: { marketingEmail: true } },
          instructorApplication: input.createInstructorApplication ? { create: { status: 'PENDING' } } : undefined,
          referralAttribution: referral ? { create: { referralCodeId: referral.id } } : undefined,
        },
        select: {
          id: true,
          email: true,
          instructorApplication: { select: { id: true } },
        },
      });
      return {
        id: user.id,
        email: user.email,
        instructorApplicationId: user.instructorApplication?.id || null,
      };
    });
  },
};
