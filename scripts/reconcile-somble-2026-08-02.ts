import { prisma } from '@/lib/db/prisma';

const sourceFile = 'Somble live activity verified 2026-08-02';
const tcjOccurrenceId = 'owned-event-tcj-hip-hop-happy-hour-tricia';
const rhyzeUpOccurrenceIds = ['owned-tue-rhyze-up-0', 'owned-thu-rhyze-up-0'];

const imports = [
  {
    name: 'Lorraine Talmadge',
    email: 'witchness56@gmail.com',
    occurredAt: new Date('2026-08-02T19:30:00.000Z'),
    amountCents: 700,
    contentType: 'Intro Offer 7-Days',
    occurrences: rhyzeUpOccurrenceIds,
  },
  {
    name: 'Michelle Flett',
    email: 'michelle_flett@yahoo.com',
    occurredAt: new Date('2026-08-01T23:30:00.000Z'),
    amountCents: 3000,
    contentType: 'TCJ Hip-Hop Happy Hour with Tricia',
    occurrences: [tcjOccurrenceId],
  },
  {
    name: 'Melissa Liberti',
    email: 'melissa.opitz@aol.com',
    occurredAt: new Date('2026-08-01T19:30:00.000Z'),
    amountCents: 3000,
    contentType: 'TCJ Hip-Hop Happy Hour with Tricia',
    occurrences: [tcjOccurrenceId],
  },
  {
    name: 'Morgan Strasser',
    email: 'morganstrasser25@gmail.com',
    occurredAt: new Date('2026-08-01T22:30:00.000Z'),
    amountCents: 3000,
    contentType: 'TCJ Hip-Hop Happy Hour with Tricia',
    occurrences: [tcjOccurrenceId],
  },
] as const;

function reference(email: string) {
  return email.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

export async function reconcileSombleAug2(apply = process.argv.includes('--apply')) {
  if (!apply) {
    const report = { mode: 'dry-run', imports, complimentaryOwners: ['vanessa@rhyzefit.com', 'melissa@rhyzefit.com'] };
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  await prisma.$transaction(async (tx) => {
    const occurrences = await tx.classOccurrence.findMany({
      where: { id: { in: [tcjOccurrenceId, ...rhyzeUpOccurrenceIds] } },
      select: { id: true, capacity: true, status: true },
    });
    if (occurrences.length !== 3 || occurrences.some((item) => item.status !== 'SCHEDULED' || item.capacity !== 25)) {
      throw new Error('Expected TCJ and both Rhyze Up occurrences to exist, be scheduled, and have capacity 25.');
    }

    for (const item of imports) {
      const user = await tx.user.upsert({
        where: { email: item.email },
        update: { name: item.name },
        create: { name: item.name, email: item.email, role: 'MEMBER', status: 'INVITED' },
      });
      await tx.memberProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
      await tx.notificationPreference.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
      await tx.sombleClientProfile.upsert({
        where: { userId: user.id },
        update: { sourceStatus: 'Active', sourceJoinedAt: item.occurredAt, sourceFile },
        create: { userId: user.id, sourceStatus: 'Active', sourceJoinedAt: item.occurredAt, sourceFile },
      });

      const transactionReference = `somble-activity-20260802-${reference(item.email)}`;
      await tx.sombleTransaction.upsert({
        where: { transferId: transactionReference },
        update: {
          userId: user.id,
          paymentId: transactionReference,
          transferredAt: item.occurredAt,
          amountCents: item.amountCents,
          contentType: item.contentType,
          supporterName: item.name,
          sourceFile,
        },
        create: {
          userId: user.id,
          transferId: transactionReference,
          paymentId: transactionReference,
          transferredAt: item.occurredAt,
          amountCents: item.amountCents,
          contentType: item.contentType,
          supporterName: item.name,
          sourceFile,
        },
      });

      for (const occurrenceId of item.occurrences) {
        await tx.booking.upsert({
          where: { occurrenceId_userId: { occurrenceId, userId: user.id } },
          update: {
            status: 'CONFIRMED',
            source: 'SOMBLE_IMPORT',
            cancelledAt: null,
            policySnapshot: { importedAccessType: item.contentType, sourceFile },
          },
          create: {
            occurrenceId,
            userId: user.id,
            status: 'CONFIRMED',
            source: 'SOMBLE_IMPORT',
            bookedAt: item.occurredAt,
            policySnapshot: { importedAccessType: item.contentType, sourceFile },
          },
        });
      }

      if (item.email === 'witchness56@gmail.com') {
        const product = await tx.product.findFirst({ where: { kind: 'INTRO_TRIAL', priceCents: 700 } });
        if (!product) throw new Error('Intro Offer 7-Days product was not found.');
        const existingMembership = await tx.membership.findFirst({ where: { userId: user.id, productId: product.id } });
        const activatedAt = item.occurredAt;
        const currentPeriodEnd = new Date(activatedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        if (existingMembership) {
          await tx.membership.update({
            where: { id: existingMembership.id },
            data: { status: 'TRIALING', activatedAt, currentPeriodStart: activatedAt, currentPeriodEnd },
          });
        } else {
          await tx.membership.create({
            data: { userId: user.id, productId: product.id, status: 'TRIALING', activatedAt, currentPeriodStart: activatedAt, currentPeriodEnd },
          });
        }
      }
    }

    for (const email of ['vanessa@rhyzefit.com', 'melissa@rhyzefit.com']) {
      const owner = await tx.user.findUnique({ where: { email } });
      if (!owner || owner.role !== 'OWNER') throw new Error(`Owner account missing: ${email}`);
      await tx.booking.upsert({
        where: { occurrenceId_userId: { occurrenceId: tcjOccurrenceId, userId: owner.id } },
        update: { status: 'CONFIRMED', source: 'OWNER_COMPLIMENTARY', cancelledAt: null },
        create: { occurrenceId: tcjOccurrenceId, userId: owner.id, source: 'OWNER_COMPLIMENTARY' },
      });
    }
  });

  const [tcj, rhyzeUp, accounts] = await Promise.all([
    prisma.booking.findMany({
      where: { occurrenceId: tcjOccurrenceId, status: 'CONFIRMED' },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { user: { name: 'asc' } },
    }),
    prisma.booking.findMany({
      where: { occurrenceId: { in: rhyzeUpOccurrenceIds }, user: { email: 'witchness56@gmail.com' }, status: 'CONFIRMED' },
      include: { occurrence: { select: { id: true, startAt: true } } },
      orderBy: { occurrence: { startAt: 'asc' } },
    }),
    prisma.user.findMany({
      where: { email: { in: imports.map((item) => item.email) } },
      select: { name: true, email: true, status: true, passwordHash: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  const report = {
    mode: 'apply',
    tcjConfirmed: tcj.length,
    tcjAttendees: tcj.map((item) => item.user),
    lorraineRhyzeUpBookings: rhyzeUp,
    importedAccounts: accounts,
  };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1]?.endsWith('reconcile-somble-2026-08-02.ts')) {
  reconcileSombleAug2()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}
