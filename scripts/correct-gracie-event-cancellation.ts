import { PrismaClient } from '@prisma/client';
import { cancellationOutcome } from '../lib/domain/bookings/booking-rules';
import {
  EVENT_CANCELLATION_CUTOFF_MINUTES,
  eventCancellationCreditTerms,
  eventCancellationCreditKey,
  eventCancellationCreditLabel,
} from '../lib/domain/bookings/cancellation-credit';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');
  const correctedAt = new Date();
  const existingCredit = await prisma.creditLedgerEntry.findFirst({
    where: {
      sourceReturnKey: { startsWith: 'event-cancellation:' },
      creditAccount: { user: { email: 'grace481@gmail.com' } },
    },
    include: {
      creditAccount: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          entries: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const existingBooking = existingCredit?.bookingId
    ? await prisma.booking.findUnique({
      where: { id: existingCredit.bookingId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        occurrence: { include: { template: true } },
      },
    })
    : null;

  const candidates = existingBooking ? [] : await prisma.booking.findMany({
    where: {
      user: { email: 'grace481@gmail.com' },
      status: { in: ['CONFIRMED', 'CANCELLED', 'LATE_CANCELLED'] },
      occurrence: {
        template: { isEvent: true },
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      occurrence: { include: { template: true } },
    },
    orderBy: { occurrence: { startAt: 'desc' } },
    take: 20,
  });
  const booking = existingBooking
    ?? candidates
      .filter((candidate) => candidate.cancelledAt)
      .sort((a, b) => b.cancelledAt!.getTime() - a.cancelledAt!.getTime())[0]
    ?? candidates
      .filter((candidate) => candidate.status === 'CONFIRMED' && candidate.occurrence.startAt > correctedAt)
      .sort((a, b) => a.occurrence.startAt.getTime() - b.occurrence.startAt.getTime())[0];

  if (!booking) {
    throw new Error('No event cancellation or upcoming confirmed event was found for Gracie Rinkle.');
  }

  const cancelledAt = booking.cancelledAt ?? correctedAt;
  const outcome = cancellationOutcome(
    booking.occurrence.startAt,
    cancelledAt,
    EVENT_CANCELLATION_CUTOFF_MINUTES,
  );
  if (!outcome.restoreCredit && !existingCredit) {
    throw new Error('The matching event is inside the six-hour late-cancel window; no correction was applied.');
  }

  const terms = eventCancellationCreditTerms(cancelledAt);
  const sourceReturnKey = eventCancellationCreditKey(booking.id);
  const currentBalance = existingCredit?.creditAccount.entries.reduce(
    (total, entry) => total + entry.quantity,
    0,
  ) ?? 0;

  const result = {
    mode: apply ? 'APPLY' : 'DRY_RUN',
    member: `${booking.user.name} <${booking.user.email}>`,
    event: booking.occurrence.template.name,
    eventStartsAt: booking.occurrence.startAt.toISOString(),
    cancelledAt: cancelledAt.toISOString(),
    currentStatus: booking.status,
    existingEventCreditBalance: currentBalance,
    correctedEventCreditBalance: existingCredit ? currentBalance : 1,
    expiresAt: terms.validUntil.toISOString(),
  };

  if (!apply) {
    console.log(JSON.stringify(result, null, 2));
    console.log('Dry run only. Re-run with --apply after reviewing this target.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${booking.id}))`;
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelledAt },
    });

    const existing = await tx.creditLedgerEntry.findUnique({
      where: { sourceReturnKey },
      include: { creditAccount: true },
    });
    if (existing) {
      await tx.creditAccount.update({
        where: { id: existing.creditAccountId },
        data: {
          label: eventCancellationCreditLabel(booking.occurrence.template.name),
          validFrom: terms.validFrom,
          validUntil: terms.validUntil,
        },
      });
      return;
    }

    const account = await tx.creditAccount.create({
      data: {
        userId: booking.user.id,
        label: eventCancellationCreditLabel(booking.occurrence.template.name),
        validFrom: terms.validFrom,
        validUntil: terms.validUntil,
      },
    });
    await tx.creditLedgerEntry.create({
      data: {
        creditAccountId: account.id,
        bookingId: booking.id,
        sourceReturnKey,
        type: 'GRANT',
        quantity: terms.quantity,
        reason: 'Admin correction: eligible early event cancellation',
      },
    });
  });

  console.log(JSON.stringify({ ...result, currentStatus: 'CANCELLED' }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
