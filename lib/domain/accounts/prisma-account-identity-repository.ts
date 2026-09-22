import { Prisma, type PrismaClient } from '@prisma/client';
import { IdentityError, type IdentityStore } from './account-identity-service';
import { queueEmail } from '@/lib/notifications/email-queue';
import { EMAIL_TEMPLATE_REVISION } from '@/lib/notifications/email-templates';
import {
  recoveryForUser,
  recoveryPurchaseId,
} from '@/lib/domain/memberships/somble-billing-recovery';

type Client = PrismaClient | Prisma.TransactionClient;

export function createIdentityStore(client: Client): IdentityStore {
  return {
    async transaction(ids, work) {
      if (!('$transaction' in client)) return work(createIdentityStore(client));
      try {
        return await client.$transaction(async (tx) => {
          // Stable lock ordering protects requests, confirmation, and contact sync.
          for (const id of [...new Set(ids)].sort()) {
            await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
          }
          return work(createIdentityStore(tx));
        });
      } catch (error) {
        // Includes the database lower(email) unique index, not just the preflight.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          throw new IdentityError('UNAVAILABLE');
        throw error;
      }
    },
    findUser(id) {
      return client.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          passwordHash: true,
          credentialsUpdatedAt: true,
          stripeCustomerId: true,
        },
      });
    },
    async takeRequestSlot(id, now) {
      const result = await client.user.updateMany({
        where: {
          id,
          OR: [
            { emailChangeRequestedAt: null },
            {
              emailChangeRequestedAt: { lte: new Date(now.getTime() - 60_000) },
            },
          ],
        },
        data: { emailChangeRequestedAt: now },
      });
      return result.count === 1;
    },
    async recoveryPending(id) {
      const recovery = recoveryForUser(id);
      if (!recovery) return false;
      const purchase = await client.purchase.findUnique({
        where: { id: recoveryPurchaseId(recovery) },
        select: { status: true },
      });
      // Exact approved identities stay stable until their explicit recovery paid.
      return (
        !purchase || !['PAID', 'PARTIALLY_REFUNDED'].includes(purchase.status)
      );
    },
    async emailInUse(email, excludingId) {
      return Boolean(
        await client.user.findFirst({
          where: {
            id: { not: excludingId },
            email: { equals: email, mode: 'insensitive' },
          },
          select: { id: true },
        }),
      );
    },
    async replaceToken(record) {
      await client.accountEmailChangeToken.deleteMany({
        where: { userId: record.userId, usedAt: null },
      });
      await client.accountEmailChangeToken.create({ data: record });
    },
    findToken(tokenHash) {
      return client.accountEmailChangeToken.findUnique({
        where: { tokenHash },
      });
    },
    async saveName(id, name) {
      await client.user.update({ where: { id }, data: { name } });
    },
    async completeEmailChange(record, at) {
      const consumed = await client.accountEmailChangeToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: at } },
        data: { usedAt: at },
      });
      if (consumed.count !== 1) throw new IdentityError('TOKEN');
      await client.user.update({
        where: { id: record.userId, email: record.oldEmail },
        data: {
          email: record.newEmail,
          emailVerified: at,
          credentialsUpdatedAt: at,
        },
      });
      await client.passwordResetToken.deleteMany({
        where: { userId: record.userId },
      });
      await client.accountClaimToken.deleteMany({
        where: { userId: record.userId },
      });
      await client.session.deleteMany({ where: { userId: record.userId } });
      await client.accountEmailChangeToken.deleteMany({
        where: { userId: record.userId, id: { not: record.id } },
      });
    },
    async queueMessage(message) {
      await queueEmail(client, message);
    },
    async queueContactSync(userId) {
      await client.accountContactSync.upsert({
        where: { userId },
        create: { userId },
        update: { attempts: 0, nextAttemptAt: new Date(), lastError: null },
      });
    },
    async audit(actorId, userId, action) {
      await client.auditLog.create({
        data: { actorId, action, entityType: 'User', entityId: userId },
      });
    },
    async templatesApproved() {
      return (
        (await client.emailTemplateReview.count({
          where: {
            template: {
              in: ['ACCOUNT_EMAIL_CONFIRMATION', 'ACCOUNT_EMAIL_CHANGED'],
            },
            revision: EMAIL_TEMPLATE_REVISION,
          },
        })) === 2
      );
    },
  };
}
