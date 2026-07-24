import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/db/prisma';
import {
  parseSombleClients,
  parseSombleTransactions,
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
  const apply = process.argv.includes('--apply');
  const dryRun = process.argv.includes('--dry-run');

  if (!clientsPath || !transactionsPath || apply === dryRun) {
    throw new Error(
      'Usage: npm run import:somble -- --clients <path> --transactions <path> (--dry-run|--apply)',
    );
  }

  const [clientsCsv, transactionsCsv] = await Promise.all([
    readFile(clientsPath, 'utf8'),
    readFile(transactionsPath, 'utf8'),
  ]);
  const clients = parseSombleClients(clientsCsv);
  const transactions = parseSombleTransactions(transactionsCsv);
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

  console.info(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        ...summary,
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
