'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export async function bookOccurrenceAction(formData: FormData): Promise<void> {
  const user = await requireArea('member');
  const occurrenceId = String(formData.get('occurrenceId') || '');

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${occurrenceId}))`;
    const occurrence = await tx.classOccurrence.findUnique({
      where: { id: occurrenceId },
    });
    if (!occurrence || occurrence.status !== 'SCHEDULED') return 'unavailable';

    const activeWaiver = await tx.waiverVersion.findFirst({
      where: { isActive: true, requiresSign: true },
      select: { id: true },
    });
    if (
      !activeWaiver ||
      !(await tx.waiverAcceptance.findUnique({
        where: {
          waiverVersionId_userId: {
            waiverVersionId: activeWaiver.id,
            userId: user.id,
          },
        },
      }))
    ) {
      return 'waiver';
    }

    if (
      await tx.booking.findUnique({
        where: { occurrenceId_userId: { occurrenceId, userId: user.id } },
      })
    ) {
      return 'duplicate';
    }

    const overlap = await tx.booking.findFirst({
      where: {
        userId: user.id,
        status: 'CONFIRMED',
        occurrence: {
          startAt: { lt: occurrence.endAt },
          endAt: { gt: occurrence.startAt },
        },
      },
    });
    if (overlap) return 'overlap';

    const booked = await tx.booking.count({
      where: { occurrenceId, status: 'CONFIRMED' },
    });
    if (booked >= occurrence.capacity) {
      await tx.waitlistEntry.upsert({
        where: { occurrenceId_userId: { occurrenceId, userId: user.id } },
        update: { status: 'WAITING', leftAt: null },
        create: { occurrenceId, userId: user.id },
      });
      return 'waitlist';
    }

    const accounts = await tx.creditAccount.findMany({
      where: {
        userId: user.id,
        validFrom: { lte: new Date() },
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
      include: { entries: true },
      orderBy: { createdAt: 'asc' },
    });
    const account = accounts.find(
      (item) =>
        item.isUnlimited ||
        item.entries.reduce((total, entry) => total + entry.quantity, 0) > 0,
    );
    if (!account) return 'access';

    const booking = await tx.booking.create({
      data: { occurrenceId, userId: user.id },
    });
    if (!account.isUnlimited) {
      await tx.creditLedgerEntry.create({
        data: {
          creditAccountId: account.id,
          bookingId: booking.id,
          type: 'RESERVE',
          quantity: -1,
          reason: 'Class booking',
        },
      });
    }
    return 'confirmed';
  });

  revalidatePath('/member/bookings');
  revalidatePath('/schedule');
  redirect(`/member/bookings?result=${result}`);
}

export async function cancelBookingAction(formData: FormData): Promise<void> {
  const user = await requireArea('member');
  const bookingId = String(formData.get('bookingId') || '');
  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, userId: user.id, status: 'CONFIRMED' },
    });
    if (!booking) return;
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    const reservation = await tx.creditLedgerEntry.findFirst({
      where: { bookingId: booking.id, type: 'RESERVE' },
    });
    if (reservation) {
      await tx.creditLedgerEntry.create({
        data: {
          creditAccountId: reservation.creditAccountId,
          bookingId: booking.id,
          type: 'RELEASE',
          quantity: 1,
          reason: 'Booking cancelled',
        },
      });
    }
  });
  revalidatePath('/member/bookings');
}
