import type { BookingStatus, Prisma, PrismaClient } from '@prisma/client';
import { queueEmail } from '@/lib/notifications/email-queue';

type Client = PrismaClient | Prisma.TransactionClient;

type BookingCancellationAlertInput = {
  bookingId: string;
  memberId: string;
  memberName: string | null;
  memberEmail: string;
  occurrenceId: string;
  className: string;
  classDate: string;
  classTime: string;
  status: BookingStatus;
  creditReturned: boolean;
};

export async function notifyAdminBookingCancellation(
  client: Client,
  input: BookingCancellationAlertInput,
) {
  const adminUrl = `/admin/schedule/${input.occurrenceId}/roster`;
  const memberLabel = input.memberName || input.memberEmail;
  const creditResult = input.creditReturned
    ? 'Credit returned to the member account.'
    : 'No credit returned because this was inside the late-cancel/no-return window or no reserved Rhyze credit was found.';
  const title = `Class cancellation: ${memberLabel}`;
  const body = `${memberLabel} cancelled ${input.className} on ${input.classDate} at ${input.classTime}. ${creditResult}`;
  const dedupeKey = `booking-cancelled-admin:${input.bookingId}`;

  const owners = await client.user.findMany({
    where: {
      role: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
      status: 'ACTIVE',
      NOT: { email: { endsWith: '@rhyze.local' } },
    },
    select: { id: true },
  });

  if (owners.length > 0) {
    await client.inAppNotification.createMany({
      data: owners.map((owner) => ({
        userId: owner.id,
        title,
        body,
        link: adminUrl,
        dedupeKey: `${dedupeKey}:${owner.id}`,
      })),
      skipDuplicates: true,
    });
  }

  await queueEmail(client, {
    to: 'melissa@rhyzefit.com',
    cc: ['vanessa@rhyzefit.com'],
    subject: title,
    template: 'ADMIN_BOOKING_CANCELLED',
    dedupeKey,
    payload: {
      memberName: memberLabel,
      memberEmail: input.memberEmail,
      className: input.className,
      classDate: input.classDate,
      classTime: input.classTime,
      bookingStatus: input.status,
      creditResult,
      adminUrl,
    },
  });
}
