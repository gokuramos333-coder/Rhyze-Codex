import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  absenceRunDay,
  prepareAbsenceFollowUp,
} from '@/lib/domain/engagement/member-absence';
import { loadCustomers, origin, settings } from '@/lib/newsletters/repository';
export async function POST(request: Request) {
  if (
    !process.env.JOB_SECRET ||
    request.headers.get('authorization') !== `Bearer ${process.env.JOB_SECRET}`
  )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const now = new Date();
  const enabledAt = new Date(process.env.MEMBER_ABSENCE_START_AT || 'invalid');
  if (
    process.env.MEMBER_ABSENCE_ENABLED !== 'true' ||
    !Number.isFinite(+enabledAt) ||
    now < enabledAt
  )
    return NextResponse.json({ paused: true });
  if (absenceRunDay(now).hour < 9 || absenceRunDay(now).hour > 17)
    return NextResponse.json({ outsideWindow: true });
  if (!process.env.EMAIL_FROM)
    return NextResponse.json({ error: 'Sender unavailable' }, { status: 503 });
  const config = await settings();
  if (!config.replyTo || !config.postalAddress)
    return NextResponse.json(
      { error: 'Email settings incomplete' },
      { status: 503 },
    );
  return NextResponse.json(
    await prepareAbsenceFollowUp(prisma, {
      now,
      enabledAt,
      customers: await loadCustomers(30),
      origin: origin(),
      sender: process.env.EMAIL_FROM,
      replyTo: config.replyTo,
      postalAddress: config.postalAddress,
      outreachEnabled: process.env.MEMBER_ABSENCE_OUTREACH_ENABLED === 'true',
      // Exact owner-approved initial recipients; the allowance expires after its Eastern day.
      historicalUserIds:
        process.env.MEMBER_ABSENCE_INITIAL_CATCHUP_DAY ===
        absenceRunDay(now).day
          ? (process.env.MEMBER_ABSENCE_INITIAL_RECIPIENT_IDS || '')
              .split(',')
              .map((id) => id.trim())
              .filter(Boolean)
          : [],
    }),
  );
}
