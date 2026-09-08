import { prisma } from '@/lib/db/prisma';
import { issueAccountClaim } from '@/lib/domain/accounts/account-claim-service';
import { prismaAccountClaimRepository } from '@/lib/domain/accounts/prisma-account-claim-repository';
import {
  parseSombleInviteMode,
  runSombleAccountInviteBatch,
} from '@/lib/domain/accounts/somble-account-invites';
import { queueEmail } from '@/lib/notifications/email-queue';

async function main() {
  if (process.argv.includes('--apply') && process.argv.includes('--dry-run')) {
    throw new Error('Choose either --dry-run or --apply, not both.');
  }
  const mode = parseSombleInviteMode(process.argv.slice(2));

  const report = await runSombleAccountInviteBatch(mode, {
    async listCandidates() {
      const users = await prisma.user.findMany({
        where: { sombleClientProfile: { isNot: null } },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          passwordHash: true,
        },
        orderBy: [{ createdAt: 'asc' }, { email: 'asc' }],
      });
      return users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        hasPassword: Boolean(user.passwordHash),
      }));
    },
    issueClaim(userId) {
      return issueAccountClaim(userId, prismaAccountClaimRepository);
    },
    async queueInvite(input) {
      await queueEmail(prisma, {
        userId: input.userId,
        to: input.email,
        subject: 'Your new My Rhyze Fitness account is ready!',
        template: 'ACCOUNT_ACTIVATION',
        payload: {
          name: input.name?.split(/\s+/)[0] || 'Rhyzer',
          activationUrl: input.activationUrl,
        },
        dedupeKey: `account-activation:${input.userId}:${input.expiresAt.toISOString()}`,
      });
    },
  });

  console.info(JSON.stringify(report, null, 2));
  if (!mode.apply) {
    console.info('Dry run only. No activation tokens or emails were created.');
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
