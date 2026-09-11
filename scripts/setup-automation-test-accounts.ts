import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { hashPassword } from '../lib/auth/password';
import {
  AUTOMATION_TEST_ACCOUNTS,
  hasAutomationAccountBusinessActivity,
} from '../lib/automation/test-accounts';
import { prisma } from '../lib/db/prisma';

function readKeychainPassword(service: string, account: string): string | null {
  try {
    return execFileSync(
      '/usr/bin/security',
      ['find-generic-password', '-s', service, '-a', account, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    return null;
  }
}

function createKeychainPassword(service: string, account: string): string {
  const password = `Rz!${randomBytes(24).toString('base64url')}7`;
  execFileSync(
    '/usr/bin/security',
    ['add-generic-password', '-U', '-s', service, '-a', account, '-w', password],
    { stdio: 'ignore' },
  );
  return password;
}

async function main() {
  const credentials = await Promise.all(
    AUTOMATION_TEST_ACCOUNTS.map(async (account) => {
      const password =
        readKeychainPassword(account.keychainService, account.email) ??
        createKeychainPassword(account.keychainService, account.email);

      return {
        account,
        passwordHash: await hashPassword(password),
      };
    }),
  );

  await prisma.$transaction(async (tx) => {
    for (const { account, passwordHash } of credentials) {
      const user = await tx.user.findUnique({
        where: { email: account.email },
        select: {
          id: true,
          stripeCustomerId: true,
          instructorApplication: { select: { id: true } },
          referralAttribution: { select: { id: true } },
          referralCommission: { select: { id: true } },
          memberConversation: { select: { id: true } },
          sombleClientProfile: { select: { id: true } },
          _count: {
            select: {
              accounts: true,
              authenticators: true,
              waiverAcceptances: true,
              auditLogs: true,
              classOccurrences: true,
              classSeries: true,
              bookings: true,
              waitlistEntries: true,
              attendanceRecords: true,
              attendanceMarked: true,
              creditAccounts: true,
              purchases: true,
              memberships: true,
              membershipChangeRequests: true,
              membershipChangeReviews: true,
              membershipFreezesCreated: true,
              commerceOrders: true,
              paymentRecords: true,
              emailMessages: true,
              campaignsCreated: true,
              instructorReviews: true,
              referralCodes: true,
              instructorCredentials: true,
              credentialReviews: true,
              instructorCommissions: true,
              inAppNotifications: true,
              conversationMessages: true,
              classMessagesAuthored: true,
              sombleTransactions: true,
            },
          },
        },
      });

      if (user && hasAutomationAccountBusinessActivity(user)) {
        throw new Error(
          `Refusing to reuse the ${account.role} test identity because it is linked to business activity.`,
        );
      }

      const notificationSettings = {
        transactionalEmail: false,
        classReminders: false,
        marketingEmail: false,
      };
      const instructorProfile = {
        isActive: false,
        canEditOwnProfile: false,
        standardClassRateCents: 0,
      };
      const commonData = {
        name: account.name,
        email: account.email,
        emailVerified: new Date(),
        passwordHash,
        credentialsUpdatedAt: new Date(),
        role: account.role,
        status: 'ACTIVE' as const,
      };
      const updateData: Prisma.UserUpdateInput = {
        ...commonData,
        memberProfile: {
          upsert: { create: {}, update: {} },
        },
        notificationPreference: {
          upsert: {
            create: notificationSettings,
            update: notificationSettings,
          },
        },
        ...(account.role === 'INSTRUCTOR'
          ? {
              instructorProfile: {
                upsert: {
                  create: instructorProfile,
                  update: instructorProfile,
                },
              },
            }
          : {}),
      };
      const createData: Prisma.UserCreateInput = {
        ...commonData,
        memberProfile: { create: {} },
        notificationPreference: { create: notificationSettings },
        ...(account.role === 'INSTRUCTOR'
          ? { instructorProfile: { create: instructorProfile } }
          : {}),
      };

      if (user) {
        await tx.user.update({ where: { id: user.id }, data: updateData });
        await tx.session.deleteMany({ where: { userId: user.id } });
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.accountClaimToken.deleteMany({ where: { userId: user.id } });
      } else {
        await tx.user.create({ data: createData });
      }
    }
  });

  console.info(
    `Configured ${AUTOMATION_TEST_ACCOUNTS.length} isolated portal test accounts; credentials are stored in macOS Keychain.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Test account setup failed.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
