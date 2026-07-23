import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function POST(request: Request) {
  if (
    !process.env.JOB_SECRET ||
    request.headers.get('authorization') !== `Bearer ${process.env.JOB_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const activeWaiver = await prisma.waiverVersion.findFirst({
    where: { isActive: true, requiresSign: true },
    orderBy: { effectiveAt: 'desc' },
    select: { id: true, version: true },
  });
  if (!activeWaiver) {
    return NextResponse.json({ queued: 0, status: 'No active agreement.' });
  }

  const acceptanceFilter = {
    none: { waiverVersionId: activeWaiver.id },
  } as const;
  const [profiles, bookings] = await Promise.all([
    prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        createdAt: { lte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        waiverAcceptances: acceptanceFilter,
      },
      select: { id: true, email: true, name: true },
    }),
    prisma.booking.findMany({
      where: {
        status: 'CONFIRMED',
        occurrence: {
          status: 'SCHEDULED',
          startAt: {
            gt: now,
            lte: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          },
        },
        user: { waiverAcceptances: acceptanceFilter },
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
        occurrence: {
          select: {
            startAt: true,
            template: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const messages = [
    ...profiles.map((user) => ({
      userId: user.id,
      to: user.email,
      subject: 'Complete your required Rhyze studio agreement',
      template: 'WAIVER_REMINDER_24_HOUR',
      payload: {
        name: user.name,
        agreementVersion: activeWaiver.version,
        path: '/member/profile',
      },
      dedupeKey: `waiver:${activeWaiver.id}:user:${user.id}:24-hour`,
    })),
    ...bookings.map((booking) => ({
      userId: booking.user.id,
      to: booking.user.email,
      subject: `Sign your Rhyze agreement before ${booking.occurrence.template.name}`,
      template: 'WAIVER_REMINDER_UPCOMING_CLASS',
      payload: {
        name: booking.user.name,
        agreementVersion: activeWaiver.version,
        className: booking.occurrence.template.name,
        startAt: booking.occurrence.startAt.toISOString(),
        path: '/member/profile',
      },
      dedupeKey: `waiver:${activeWaiver.id}:booking:${booking.id}`,
    })),
  ];

  await Promise.all(
    messages.map((message) =>
      prisma.emailMessage.upsert({
        where: { dedupeKey: message.dedupeKey },
        update: {},
        create: message,
      }),
    ),
  );

  return NextResponse.json({
    queued: messages.length,
    profiles: profiles.length,
    upcomingClasses: bookings.length,
  });
}
