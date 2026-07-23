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
    return prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash: input.passwordHash,
        memberProfile: { create: { phone: input.phone } },
        notificationPreference: { create: { marketingEmail: true } },
        instructorApplication: input.createInstructorApplication
          ? { create: { status: 'PENDING' } }
          : undefined,
      },
      select: { id: true, email: true },
    });
  },
};
