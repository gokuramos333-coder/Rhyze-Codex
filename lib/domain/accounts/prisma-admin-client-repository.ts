import { prisma } from '@/lib/db/prisma';
import { createSecureToken } from '@/lib/auth/tokens';
import { queueEmail } from '@/lib/notifications/email-queue';
import type { AdminClientRepository } from './admin-client-creation';

const ACCOUNT_ACTIVATION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

export const prismaAdminClientRepository: AdminClientRepository = {
  findByEmail(email) {
    return prisma.user.findUnique({ where: { email }, select: { id: true } });
  },
  async createInvitedMember(input) {
    const { token, tokenHash } = createSecureToken();
    const expiresAt = new Date(Date.now() + ACCOUNT_ACTIVATION_LIFETIME_MS);
    const origin = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rhyzefitness.com').replace(/\/$/, '');

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          role: 'MEMBER',
          status: 'INVITED',
          memberProfile: { create: { phone: input.phone, dateOfBirth: input.dateOfBirth } },
          notificationPreference: { create: { marketingEmail: true } },
        },
        select: { id: true, email: true },
      });
      await tx.accountClaimToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: 'admin.client-created',
          entityType: 'User',
          entityId: user.id,
          after: { email: input.email, status: 'INVITED' },
        },
      });
      await queueEmail(tx, {
        userId: user.id,
        to: user.email,
        subject: 'Your My Rhyze account is ready to activate',
        template: 'ADMIN_CLIENT_INVITATION',
        payload: {
          name: input.name,
          activationUrl: `${origin}/claim-account/${token}`,
        },
        dedupeKey: `admin-client-invitation:${user.id}`,
      });
      return user;
    });
  },
};
