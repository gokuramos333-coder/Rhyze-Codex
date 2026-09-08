import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db/prisma';
import {
  parseSombleClients,
  parseSombleMemberships,
  parseSombleTransactions,
  sombleMembershipStatus,
  sombleImportedCreditEntitlement,
  sombleProductDefaults,
  summarizeSombleImport,
} from '@/lib/import/somble';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

async function main() {
  const clientsPath = argument('--clients');
  const transactionsPath = argument('--transactions');
  const membershipsPath = argument('--memberships');
  const apply = process.argv.includes('--apply');
  const dryRun = process.argv.includes('--dry-run');

  if (!clientsPath || !transactionsPath || apply === dryRun) {
    throw new Error(
      'Usage: npm run import:somble -- --clients <path> --transactions <path> [--memberships <path>] (--dry-run|--apply)',
    );
  }

  const [clientsCsv, transactionsCsv, membershipsCsv] = await Promise.all([
    readFile(clientsPath, 'utf8'),
    readFile(transactionsPath, 'utf8'),
    membershipsPath ? readFile(membershipsPath, 'utf8') : Promise.resolve(null),
  ]);
  const clients = parseSombleClients(clientsCsv);
  const transactions = parseSombleTransactions(transactionsCsv);
  const memberships = membershipsCsv
    ? parseSombleMemberships(membershipsCsv)
    : [];
  const summary = summarizeSombleImport(clients, transactions);
  const emailByName = new Map<string, string>();

  for (const client of clients) {
    const name = normalizedName(client.name);
    if (emailByName.has(name)) {
      throw new Error(`Ambiguous client name in Somble export: ${client.name}`);
    }
    emailByName.set(name, client.email);
  }

  for (const transaction of transactions) {
    if (!emailByName.has(normalizedName(transaction.supporterName))) {
      throw new Error(
        `Transaction supporter is missing from client export: ${transaction.supporterName}`,
      );
    }
  }

  const clientEmails = new Set(clients.map((client) => client.email));
  for (const membership of memberships) {
    if (!clientEmails.has(membership.supporterEmail)) {
      throw new Error(
        `Membership supporter is missing from client export: ${membership.supporterEmail}`,
      );
    }
  }

  console.info(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        ...summary,
        membershipCount: memberships.length,
        membershipCreditsRemaining: memberships.reduce(
          (total, membership) => total + (membership.creditsRemaining ?? 0),
          0,
        ),
        transferredRevenue: `$${(
          summary.transferredRevenueCents / 100
        ).toFixed(2)}`,
      },
      null,
      2,
    ),
  );

  if (!apply) return;

  const clientSourceFile = path.basename(clientsPath);
  const transactionSourceFile = path.basename(transactionsPath);

  await prisma.$transaction(async (database) => {
    const userIdByEmail = new Map<string, string>();
    for (const client of clients) {
      const existing = await database.user.findUnique({
        where: { email: client.email },
        select: { id: true },
      });
      const user =
        existing ??
        (await database.user.create({
          data: {
            name: client.name,
            email: client.email,
            role: 'MEMBER',
            status: 'INVITED',
            createdAt: client.sourceJoinedAt,
            memberProfile: {
              create: { dateOfBirth: client.birthday },
            },
            notificationPreference: { create: {} },
          },
          select: { id: true },
        }));
      userIdByEmail.set(client.email, user.id);

      await database.sombleClientProfile.upsert({
        where: { userId: user.id },
        update: {
          sourceStatus: client.sourceStatus,
          lastWorkoutAt: client.lastWorkoutAt,
          lastLoginAt: client.lastLoginAt,
          sourceJoinedAt: client.sourceJoinedAt,
          totalWorkouts: client.totalWorkouts,
          appDownloaded: client.appDownloaded,
          birthday: client.birthday,
          sourceFile: clientSourceFile,
        },
        create: {
          userId: user.id,
          sourceStatus: client.sourceStatus,
          lastWorkoutAt: client.lastWorkoutAt,
          lastLoginAt: client.lastLoginAt,
          sourceJoinedAt: client.sourceJoinedAt,
          totalWorkouts: client.totalWorkouts,
          appDownloaded: client.appDownloaded,
          birthday: client.birthday,
          sourceFile: clientSourceFile,
        },
      });
    }

    for (const transaction of transactions) {
      const email = emailByName.get(
        normalizedName(transaction.supporterName),
      )!;
      const userId = userIdByEmail.get(email)!;
      await database.sombleTransaction.upsert({
        where: { transferId: transaction.transferId },
        update: {
          userId,
          paymentId: transaction.paymentId,
          transferredAt: transaction.transferredAt,
          amountCents: transaction.amountCents,
          contentType: transaction.contentType,
          supporterName: transaction.supporterName,
          sourceFile: transactionSourceFile,
        },
        create: {
          userId,
          transferId: transaction.transferId,
          paymentId: transaction.paymentId,
          transferredAt: transaction.transferredAt,
          amountCents: transaction.amountCents,
          contentType: transaction.contentType,
          supporterName: transaction.supporterName,
          sourceFile: transactionSourceFile,
        },
      });
    }

    if (memberships.length) {
      const products = await database.product.findMany();
      const productByName = new Map(
        products.map((product) => [normalizedName(product.name), product]),
      );

      for (const membership of memberships) {
        const userId = userIdByEmail.get(membership.supporterEmail)!;
        const defaults = sombleProductDefaults(membership);
        let product = productByName.get(normalizedName(membership.planName));
        if (!product) {
          product = await database.product.upsert({
            where: { slug: defaults.slug },
            update: {},
            create: {
              name: membership.planName,
              ...defaults,
              eligibleCategoryIds: [],
              customPlanType: 'Legacy Somble import',
            },
          });
          productByName.set(normalizedName(product.name), product);
        }

        const existingMembership = await database.membership.findFirst({
          where: {
            userId,
            productId: product.id,
            currentPeriodStart: membership.purchasedAt,
            stripeSubscriptionId: null,
          },
        });
        const membershipData = {
          status: sombleMembershipStatus(membership.status),
          currentPeriodEnd: membership.expiresAt,
          activatedAt:
            membership.status === 'active' ? membership.purchasedAt : null,
        };
        if (existingMembership) {
          await database.membership.update({
            where: { id: existingMembership.id },
            data: membershipData,
          });
        } else {
          await database.membership.create({
            data: {
              userId,
              productId: product.id,
              currentPeriodStart: membership.purchasedAt,
              ...membershipData,
            },
          });
        }

        const entitlement = sombleImportedCreditEntitlement({
          creditsRemaining: membership.creditsRemaining,
          includedCredits: product.includedCredits ?? defaults.includedCredits,
          isUnlimited: product.isUnlimited || defaults.isUnlimited,
        });
        if (!entitlement.shouldCreate) continue;

        const label = `Somble · ${membership.planName} · ${membership.purchasedAt.toISOString()}`;
        let creditAccount = await database.creditAccount.findFirst({
          where: { userId, label },
          include: { entries: true },
        });
        if (!creditAccount) {
          creditAccount = await database.creditAccount.create({
            data: {
              userId,
              label,
              isUnlimited: entitlement.isUnlimited,
              validFrom: membership.purchasedAt,
              validUntil: membership.expiresAt,
            },
            include: { entries: true },
          });
        } else {
          creditAccount = await database.creditAccount.update({
            where: { id: creditAccount.id },
            data: {
              isUnlimited: entitlement.isUnlimited,
              validFrom: membership.purchasedAt,
              validUntil: membership.expiresAt,
            },
            include: { entries: true },
          });
        }

        if (entitlement.balance !== null) {
          const currentBalance = creditAccount.entries.reduce(
            (total, entry) => total + entry.quantity,
            0,
          );
          const adjustment = entitlement.balance - currentBalance;
          if (adjustment !== 0) {
            await database.creditLedgerEntry.create({
              data: {
                creditAccountId: creditAccount.id,
                type: 'ADJUSTMENT',
                quantity: adjustment,
                reason: `Somble balance reconciliation from ${path.basename(membershipsPath!)}`,
              },
            });
          }
        }
      }
    }
  });

  const [profileCount, transactionCount, revenue] = await Promise.all([
    prisma.sombleClientProfile.count(),
    prisma.sombleTransaction.count(),
    prisma.sombleTransaction.aggregate({ _sum: { amountCents: true } }),
  ]);
  console.info(
    JSON.stringify(
      {
        applied: true,
        databaseProfileCount: profileCount,
        databaseTransactionCount: transactionCount,
        databaseTransferredRevenueCents: revenue._sum.amountCents ?? 0,
        importedMembershipCount: memberships.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
