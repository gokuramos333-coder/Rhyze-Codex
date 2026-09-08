'use server';

import type { AttendanceStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { bookingStatusForAttendance } from '@/lib/domain/bookings/booking-rules';

const validStatuses = new Set<AttendanceStatus>([
  'CHECKED_IN',
  'ATTENDED',
  'NO_SHOW',
  'LATE_CANCELLED',
]);

export async function markAttendanceAction(formData: FormData): Promise<void> {
  const actor = await requireArea('instructor');
  const occurrenceId = String(formData.get('occurrenceId') || '');
  const bookingId = String(formData.get('bookingId') || '');
  const status = String(formData.get('status') || '') as AttendanceStatus;
  if (!validStatuses.has(status)) return;

  const occurrence = await prisma.classOccurrence.findUnique({
    where: { id: occurrenceId },
    select: { instructorId: true },
  });
  if (!occurrence || (actor.role === 'INSTRUCTOR' && occurrence.instructorId !== actor.id)) {
    return;
  }

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, occurrenceId },
  });
  if (!booking) return;

  await prisma.$transaction([
    prisma.attendanceRecord.upsert({
      where: { occurrenceId_userId: { occurrenceId, userId: booking.userId } },
      update: {
        status,
        markedById: actor.id,
        checkedInAt: status === 'CHECKED_IN' ? new Date() : undefined,
      },
      create: {
        occurrenceId,
        bookingId,
        userId: booking.userId,
        status,
        markedById: actor.id,
        checkedInAt: status === 'CHECKED_IN' ? new Date() : undefined,
      },
    }),
    prisma.booking.update({
      where: { id: booking.id },
      data: { status: bookingStatusForAttendance(status) },
    }),
  ]);

  revalidatePath(`/instructor/classes/${occurrenceId}/roster`);
  revalidatePath(`/admin/schedule/${occurrenceId}/roster`);
}

export async function restoreCreditAction(formData: FormData): Promise<void> {
  const actor = await requireArea('admin');
  const occurrenceId = String(formData.get('occurrenceId') || '');
  const bookingId = String(formData.get('bookingId') || '');
  const reservation = await prisma.creditLedgerEntry.findFirst({
    where: { bookingId, type: 'RESERVE' },
  });
  if (!reservation) return;
  const alreadyRestored = await prisma.creditLedgerEntry.findFirst({
    where: { bookingId, type: 'RESTORE' },
  });
  if (!alreadyRestored) {
    await prisma.creditLedgerEntry.create({
      data: {
        creditAccountId: reservation.creditAccountId,
        bookingId,
        type: 'RESTORE',
        quantity: 1,
        reason: `Manual restore by ${actor.email}`,
      },
    });
  }
  revalidatePath(`/admin/schedule/${occurrenceId}/roster`);
}
