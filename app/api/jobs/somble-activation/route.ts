import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { issueAccountClaim } from '@/lib/domain/accounts/account-claim-service';
import { prismaAccountClaimRepository } from '@/lib/domain/accounts/prisma-account-claim-repository';
import { EMAIL_TEMPLATE_REVISION } from '@/lib/notifications/email-templates';

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!process.env.JOB_SECRET || authorization !== `Bearer ${process.env.JOB_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const owner = await prisma.user.findFirst({
    where: { role: { in: ['OWNER', 'ADMIN'] } },
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!owner) return NextResponse.json({ error: 'No owner/admin user found' }, { status: 500 });

  await prisma.emailTemplateReview.upsert({
    where: { template: 'ACCOUNT_ACTIVATION' },
    update: {
      revision: EMAIL_TEMPLATE_REVISION,
      approvedAt: new Date(),
      approvedById: owner.id,
      approvedByEmail: owner.email,
    },
    create: {
      template: 'ACCOUNT_ACTIVATION',
      revision: EMAIL_TEMPLATE_REVISION,
      approvedById: owner.id,
      approvedByEmail: owner.email,
    },
  });

  const body: { emails?: unknown; reminder?: unknown } = await request.json().catch(() => ({}));
  const requestedEmails: string[] = Array.isArray(body.emails)
    ? body.emails
        .filter((email: unknown): email is string => typeof email === 'string')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const reminder = body.reminder === true;
  const requestedEmailSet = new Set(requestedEmails);

  const candidates = await prisma.user.findMany({
    where: {
      sombleClientProfile: { isNot: null },
      ...(requestedEmailSet.size ? { email: { in: [...requestedEmailSet] } } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      passwordHash: true,
    },
    orderBy: [{ createdAt: 'asc' }, { email: 'asc' }],
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.rhyzefitness.com';
  const skipped: Array<{ email: string; reason: string }> = [];
  const queuedAccounts: Array<{ name: string | null; email: string }> = [];
  let queued = 0;
  let alreadySent = 0;

  for (const candidate of candidates) {
    if (candidate.role !== 'MEMBER') {
      skipped.push({ email: candidate.email, reason: 'non-member-role' });
      continue;
    }
    if (candidate.status === 'ACTIVE' || candidate.passwordHash) {
      skipped.push({ email: candidate.email, reason: 'already-active' });
      continue;
    }
    if (candidate.status !== 'INVITED') {
      skipped.push({ email: candidate.email, reason: 'not-invited' });
      continue;
    }

    const dedupeKey = `account-activation-imported:${candidate.id}`;
    const existing = await prisma.emailMessage.findUnique({
      where: { dedupeKey },
      select: { status: true },
    });
    if (!reminder && existing?.status === 'SENT') {
      alreadySent += 1;
      continue;
    }

    const claim = await issueAccountClaim(candidate.id, prismaAccountClaimRepository);
    const activationUrl = new URL(
      `/claim-account/${encodeURIComponent(claim.rawToken)}`,
      appUrl,
    ).toString();

    const messageData = {
      userId: candidate.id,
      to: candidate.email,
      toList: [candidate.email],
      subject: 'Your new My Rhyze Fitness account is ready!',
      template: 'ACCOUNT_ACTIVATION',
      payload: {
        name: candidate.name?.split(/\s+/)[0] || 'Rhyzer',
        activationUrl,
      },
      scheduledFor: new Date(),
      status: 'QUEUED' as const,
      attempts: 0,
      sentAt: null,
      providerId: null,
      lastError: null,
    };

    if (reminder) {
      await prisma.emailMessage.create({
        data: {
          ...messageData,
          dedupeKey: `account-activation-reminder:${candidate.id}:${Date.now()}`,
        },
      });
    } else {
      await prisma.emailMessage.upsert({
        where: { dedupeKey },
        update: messageData,
        create: {
          ...messageData,
          dedupeKey,
        },
      });
    }
    queuedAccounts.push({ name: candidate.name, email: candidate.email });
    queued += 1;
  }

  return NextResponse.json({
    requested: requestedEmails.length,
    reminder,
    missingRequestedEmails: requestedEmails.filter(
      (email) => !candidates.some((candidate) => candidate.email.toLowerCase() === email),
    ),
    candidates: candidates.length,
    queued,
    queuedAccounts,
    alreadySent,
    skipped: skipped.length,
    skippedAccounts: skipped,
  });
}
