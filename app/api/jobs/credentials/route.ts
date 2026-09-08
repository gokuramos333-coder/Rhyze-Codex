import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { credentialReminderKind } from '@/lib/domain/credentials/reminder-service';

export async function POST(request: Request) {
  if (!process.env.JOB_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.JOB_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const now = new Date();
  const credentials = await prisma.instructorCredential.findMany({
    where: { expiresAt: { not: null, lte: new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000) } },
    include: { instructor: true },
  });
  let queued = 0;
  for (const credential of credentials) {
    if (!credential.expiresAt) continue;
    const kind = credentialReminderKind(credential.expiresAt, now);
    if (!kind) continue;
    const dedupeKey = `credential:${credential.id}:${kind}:${now.toISOString().slice(0, 10)}`;
    const message = await prisma.emailMessage.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        userId: credential.instructorId,
        to: credential.instructor.email,
        subject: kind === 'EXPIRED' ? `Your Rhyze ${credential.type} document expired` : `Your Rhyze ${credential.type} document expires soon`,
        template: `CREDENTIAL_${kind}`,
        payload: {
          name: credential.instructor.name || 'Instructor',
          credentialName: credential.type === 'CPR' ? 'CPR certification' : 'instructor insurance',
          expirationDate: credential.expiresAt.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric' }),
          profileUrl: '/instructor/profile',
        },
        dedupeKey,
      },
    });
    if (message.createdAt.getTime() >= now.getTime() - 5_000) queued += 1;
  }
  const missingApplications = await prisma.instructorApplication.findMany({
    where: { status: 'APPROVED', reviewedAt: { lte: new Date(now.getTime() - 48 * 60 * 60 * 1000) }, user: { instructorCredentials: { none: {} } } },
    include: { user: true },
  });
  for (const application of missingApplications) {
    const dedupeKey = `credentials-missing:${application.userId}`;
    await prisma.emailMessage.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        userId: application.userId,
        to: application.user.email,
        subject: 'Your Rhyze instructor documents are missing',
        template: 'INSTRUCTOR_DOCUMENTS_MISSING',
        payload: {
          name: application.user.name || 'Instructor',
          missingDocuments: 'Instructor insurance and CPR certification',
          profileUrl: '/instructor/profile',
        },
        dedupeKey,
      },
    });
  }
  return NextResponse.json({ queued, missing: missingApplications.length });
}
