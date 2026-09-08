'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { cancellationOutcome } from '@/lib/domain/bookings/booking-rules';
import { queueEmail } from '@/lib/notifications/email-queue';

export async function bookOccurrenceAction(formData: FormData): Promise<void> {
  const user = await requireArea('member');
  const occurrenceId = String(formData.get('occurrenceId') || '');

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${occurrenceId}))`;
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
    await queueEmail(tx, {
      userId: user.id,
      to: user.email,
      subject: `You're booked for ${occurrence.startAt.toLocaleDateString()}`,
      template: 'BOOKING_CONFIRMATION',
      payload: { bookingId: booking.id, occurrenceId },
    });
    await queueEmail(tx, {
      userId: user.id,
      to: user.email,
      subject: 'Your Rhyze class is tomorrow',
      template: 'CLASS_REMINDER',
      payload: { bookingId: booking.id, occurrenceId },
      scheduledFor: new Date(occurrence.startAt.getTime() - 24 * 60 * 60 * 1000),
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
      include: { occurrence: true },
    });
    if (!booking) return;
    const outcome = cancellationOutcome(
      booking.occurrence.startAt,
      new Date(),
      120,
    );
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: outcome.status, cancelledAt: new Date() },
    });
    await queueEmail(tx, {
      userId: user.id,
      to: user.email,
      subject: 'Your Rhyze booking was cancelled',
      template: 'BOOKING_CANCELLATION',
      payload: { bookingId: booking.id },
    });
    const reservation = await tx.creditLedgerEntry.findFirst({
      where: { bookingId: booking.id, type: 'RESERVE' },
    });
    if (reservation && outcome.restoreCredit) {
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
    if (outcome.status === 'CANCELLED') {
      const next = await tx.waitlistEntry.findFirst({
        where: { occurrenceId: booking.occurrenceId, status: 'WAITING' },
        include: { user: true },
        orderBy: { joinedAt: 'asc' },
      });
      if (next) {
        const account = await tx.creditAccount.findFirst({
          where: {
            userId: next.userId,
            validFrom: { lte: new Date() },
            OR: [{ isUnlimited: true }, { entries: { some: {} } }],
          },
          include: { entries: true },
          orderBy: { createdAt: 'asc' },
        });
        const balance = account?.entries.reduce((total, entry) => total + entry.quantity, 0) || 0;
        if (account && (account.isUnlimited || balance > 0)) {
          const promoted = await tx.booking.create({
            data: { occurrenceId: booking.occurrenceId, userId: next.userId, source: 'WAITLIST' },
          });
          if (!account.isUnlimited) {
            await tx.creditLedgerEntry.create({
              data: { creditAccountId: account.id, bookingId: promoted.id, type: 'RESERVE', quantity: -1, reason: 'Waitlist promotion' },
            });
          }
          await tx.waitlistEntry.update({ where: { id: next.id }, data: { status: 'PROMOTED', promotedAt: new Date() } });
          await queueEmail(tx, {
            userId: next.userId,
            to: next.user.email,
            subject: 'You are off the Rhyze waitlist',
            template: 'WAITLIST_PROMOTED',
            payload: { bookingId: promoted.id, occurrenceId: booking.occurrenceId },
          });
        }
      }
    }
  });
  revalidatePath('/member/bookings');
}

export async function leaveWaitlistAction(formData: FormData): Promise<void> {
  const user = await requireArea('member');
  const waitlistId = String(formData.get('waitlistId') || '');
  await prisma.waitlistEntry.updateMany({
    where: { id: waitlistId, userId: user.id, status: 'WAITING' },
    data: { status: 'LEFT', leftAt: new Date() },
  });
  revalidatePath('/member/bookings');
}
