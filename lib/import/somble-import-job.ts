import type { PrismaClient } from '@prisma/client';
import {
  groupSombleAttendees,
  parseSombleClients,
  parseSombleAttendees,
  parseSombleMemberships,
  parseSombleTransactions,
  sombleMembershipStatus,
  sombleImportedCreditEntitlement,
  sombleProductDefaults,
  summarizeSombleImport,
} from '@/lib/import/somble';

const MAX_CSV_BYTES = 2_000_000;

export function isSombleImportAuthorized(
  authorization: string | null,
  secrets: { jobSecret?: string; importSecret?: string },
) {
  if (!authorization) return false;
  return [secrets.jobSecret, secrets.importSecret]
    .filter((secret): secret is string => Boolean(secret))
    .some((secret) => authorization === `Bearer ${secret}`);
}

export function shouldPreserveExistingBooking(
  booking: { source: string } | null,
) {
  return Boolean(booking && booking.source !== 'SOMBLE_IMPORT');
}

export type SombleImportJobPayload = {
  clientsCsv: string;
  transactionsCsv: string;
  membershipsCsv?: string;
  clientSourceFile: string;
  transactionSourceFile: string;
  membershipSourceFile?: string;
};

export type SombleRosterJobPayload = {
  rosters: Array<{
    occurrenceId: string;
    attendeesCsv: string;
    sourceFile: string;
  }>;
};

function requiredText(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_CSV_BYTES) {
    throw new Error(`${label} exceeds the 2 MB import limit`);
  }
  return value;
}

function sourceName(value: unknown, label: string) {
  const name = requiredText(value, label).trim();
  if (name.includes('/') || name.includes('\\')) {
    throw new Error(`${label} must be a file name, not a path`);
  }
  return name;
}

export function parseSombleImportJobPayload(
  value: unknown,
): SombleImportJobPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Import payload must be an object');
  }
  const payload = value as Record<string, unknown>;
  const membershipsCsv =
    typeof payload.membershipsCsv === 'string' && payload.membershipsCsv.trim()
      ? requiredText(payload.membershipsCsv, 'membershipsCsv')
      : undefined;
  return {
    clientsCsv: requiredText(payload.clientsCsv, 'clientsCsv'),
    transactionsCsv: requiredText(
      payload.transactionsCsv,
      'transactionsCsv',
    ),
    membershipsCsv,
    clientSourceFile: sourceName(
      payload.clientSourceFile,
      'clientSourceFile',
    ),
    transactionSourceFile: sourceName(
      payload.transactionSourceFile,
      'transactionSourceFile',
    ),
    membershipSourceFile: membershipsCsv
      ? sourceName(payload.membershipSourceFile, 'membershipSourceFile')
      : undefined,
  };
}

export function parseSombleRosterJobPayload(
  value: unknown,
): SombleRosterJobPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Roster payload must be an object');
  }
  const rosters = (value as Record<string, unknown>).rosters;
  if (!Array.isArray(rosters) || !rosters.length || rosters.length > 100) {
    throw new Error('rosters must contain between 1 and 100 exports');
  }
  return {
    rosters: rosters.map((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`rosters[${index}] must be an object`);
      }
      const roster = value as Record<string, unknown>;
      return {
        occurrenceId: requiredText(
          roster.occurrenceId,
          `rosters[${index}].occurrenceId`,
        ).trim(),
        attendeesCsv: requiredText(
          roster.attendeesCsv,
          `rosters[${index}].attendeesCsv`,
        ),
        sourceFile: sourceName(
          roster.sourceFile,
          `rosters[${index}].sourceFile`,
        ),
      };
    }),
  };
}

function normalizedName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function applySombleImportJob(
  prisma: PrismaClient,
  payload: SombleImportJobPayload,
) {
  const clients = parseSombleClients(payload.clientsCsv);
  const transactions = parseSombleTransactions(payload.transactionsCsv);
  const memberships = payload.membershipsCsv
    ? parseSombleMemberships(payload.membershipsCsv)
    : [];
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
            memberProfile: { create: { dateOfBirth: client.birthday } },
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
          sourceFile: payload.clientSourceFile,
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
          sourceFile: payload.clientSourceFile,
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
          sourceFile: payload.transactionSourceFile,
        },
        create: {
          userId,
          transferId: transaction.transferId,
          paymentId: transaction.paymentId,
          transferredAt: transaction.transferredAt,
          amountCents: transaction.amountCents,
          contentType: transaction.contentType,
          supporterName: transaction.supporterName,
          sourceFile: payload.transactionSourceFile,
        },
      });
    }

    if (!memberships.length) return;
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
              reason: `Somble balance reconciliation from ${payload.membershipSourceFile}`,
            },
          });
        }
      }
    }
  });

  const summary = summarizeSombleImport(clients, transactions);
  return {
    ...summary,
    membershipCount: memberships.length,
    membershipCreditsRemaining: memberships.reduce(
      (total, membership) => total + (membership.creditsRemaining ?? 0),
      0,
    ),
  };
}

export async function applySombleRosterJob(
  prisma: PrismaClient,
  payload: SombleRosterJobPayload,
) {
  const report: Array<{
    occurrenceId: string;
    className: string;
    attendees: number;
    bookings: number;
    guests: number;
  }> = [];

  for (const roster of payload.rosters) {
    const occurrence = await prisma.classOccurrence.findUnique({
      where: { id: roster.occurrenceId },
      include: { template: true },
    });
    if (!occurrence) {
      throw new Error(`Unknown occurrence: ${roster.occurrenceId}`);
    }
    const attendees = parseSombleAttendees(roster.attendeesCsv);
    const groupedAttendees = groupSombleAttendees(attendees);

    await prisma.$transaction(async (database) => {
      for (const { attendee, guests } of groupedAttendees) {
        const user = await database.user.upsert({
          where: { email: attendee.email },
          update: attendee.name ? { name: attendee.name } : {},
          create: {
            name: attendee.name,
            email: attendee.email,
            role: 'MEMBER',
            status: 'INVITED',
            memberProfile: { create: {} },
            notificationPreference: { create: {} },
          },
        });
        const existingBooking = await database.booking.findUnique({
          where: {
            occurrenceId_userId: {
              occurrenceId: occurrence.id,
              userId: user.id,
            },
          },
        });
        const booking =
          shouldPreserveExistingBooking(existingBooking)
            ? existingBooking
            : await database.booking.upsert({
                where: {
                  occurrenceId_userId: {
                    occurrenceId: occurrence.id,
                    userId: user.id,
                  },
                },
                update: {
                  status: attendee.checkedIn ? 'ATTENDED' : 'CONFIRMED',
                  source: 'SOMBLE_IMPORT',
                  policySnapshot: {
                    importedAccessType: attendee.accessType,
                    importedGuests: guests,
                    sourceFile: roster.sourceFile,
                  },
                },
                create: {
                  occurrenceId: occurrence.id,
                  userId: user.id,
                  status: attendee.checkedIn ? 'ATTENDED' : 'CONFIRMED',
                  source: 'SOMBLE_IMPORT',
                  policySnapshot: {
                    importedAccessType: attendee.accessType,
                    importedGuests: guests,
                    sourceFile: roster.sourceFile,
                  },
                },
              });
        if (attendee.checkedIn && booking) {
          await database.attendanceRecord.upsert({
            where: {
              occurrenceId_userId: {
                occurrenceId: occurrence.id,
                userId: user.id,
              },
            },
            update: {
              bookingId: booking.id,
              status: 'ATTENDED',
              checkedInAt: occurrence.startAt,
            },
            create: {
              occurrenceId: occurrence.id,
              bookingId: booking.id,
              userId: user.id,
              status: 'ATTENDED',
              checkedInAt: occurrence.startAt,
            },
          });
        }
      }
      await database.booking.updateMany({
        where: {
          occurrenceId: occurrence.id,
          source: 'SOMBLE_IMPORT',
          user: {
            email: {
              notIn: groupedAttendees.map((item) => item.attendee.email),
            },
          },
        },
        data: { status: 'CANCELLED' },
      });
      await database.classOccurrence.update({
        where: { id: occurrence.id },
        data: {
          historicalSignupCount: attendees.length - groupedAttendees.length,
          capacity: 25,
        },
      });
    });

    report.push({
      occurrenceId: occurrence.id,
      className: occurrence.template.name,
      attendees: attendees.length,
      bookings: groupedAttendees.length,
      guests: attendees.length - groupedAttendees.length,
    });
  }
  return { rosters: report, rosterCount: report.length };
}
