import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { queueEmail } from '@/lib/notifications/email-queue';

function appUrl(path: string) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://rhyzefit.com';
  return new URL(path, origin).toString();
}

export async function POST(request: Request) {
  if (
    !process.env.JOB_SECRET ||
    request.headers.get('authorization') !== `Bearer ${process.env.JOB_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const activeWaiver = await prisma.waiverVersion.findFirst({
    where: { isActive: true, requiresSign: true },
    select: { id: true },
    orderBy: { effectiveAt: 'desc' },
  });

  const members = await prisma.user.findMany({
    where: {
      role: 'MEMBER',
      email: { not: '' },
      OR: [
        { name: null },
        { name: { not: { contains: ' ' } } },
        { memberProfile: null },
        { memberProfile: { phone: null } },
        { memberProfile: { dateOfBirth: null } },
        ...(activeWaiver
          ? [{ waiverAcceptances: { none: { waiverVersionId: activeWaiver.id } } }]
          : [{ waiverAcceptances: { none: {} } }]),
      ],
    },
    select: {
      id: true,
      name: true,
      email: true,
      memberProfile: { select: { phone: true, dateOfBirth: true } },
      waiverAcceptances: activeWaiver
        ? { where: { waiverVersionId: activeWaiver.id }, select: { id: true } }
        : { select: { id: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });

  let queued = 0;
  for (const member of members) {
    await queueEmail(prisma, {
      userId: member.id,
      to: member.email,
      subject: 'Please update your Rhyze profile and waivers',
      template: 'PROFILE_COMPLETION_REMINDER',
      payload: {
        name: member.name || 'Rhyzer',
        profileUrl: appUrl('/member/profile'),
        waiverUrl: appUrl('/member/waiver'),
      },
      dedupeKey: `profile-completion-reminder:${member.id}:2026-08-birthdate-waiver`,
    });
    queued += 1;
  }

  return NextResponse.json({ queued, checked: members.length });
}
