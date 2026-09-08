import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { buildBirthdayReminderPlans } from '@/lib/domain/birthdays/birthday-reminders';
import { queueEmail } from '@/lib/notifications/email-queue';

export async function POST(request: Request) {
  if (
    !process.env.JOB_SECRET ||
    request.headers.get('authorization') !== `Bearer ${process.env.JOB_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const people = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      role: { in: ['MEMBER', 'INSTRUCTOR'] },
      memberProfile: { dateOfBirth: { not: null } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      memberProfile: { select: { dateOfBirth: true } },
    },
  });
  const plans = buildBirthdayReminderPlans(
    new Date(),
    people.flatMap((person) => person.memberProfile?.dateOfBirth
      ? [{
          id: person.id,
          name: person.name,
          email: person.email,
          role: person.role,
          dateOfBirth: person.memberProfile.dateOfBirth,
        }]
      : []),
  );

  await Promise.all(plans.map((plan) => queueEmail(prisma, plan)));

  return NextResponse.json({
    peopleChecked: people.length,
    emailsQueued: plans.length,
    monthlyEmails: plans.filter((plan) => plan.kind === 'MONTHLY').length,
    weekAheadEmails: plans.filter((plan) => plan.kind === 'WEEK_AHEAD').length,
  });
}
