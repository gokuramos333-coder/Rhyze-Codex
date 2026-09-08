import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function requireJobSecret(request: Request) {
  const authorization = request.headers.get('authorization');
  const jobSecretMatches = Boolean(
    process.env.JOB_SECRET && authorization === `Bearer ${process.env.JOB_SECRET}`,
  );
  const reportSecretMatches = Boolean(
    process.env.CLAIM_REPORT_SECRET && authorization === `Bearer ${process.env.CLAIM_REPORT_SECRET}`,
  );
  return jobSecretMatches || reportSecretMatches;
}

function sinceFromRequest(request: Request) {
  const url = new URL(request.url);
  const rawSince = url.searchParams.get('since');
  if (rawSince) {
    const since = new Date(rawSince);
    if (!Number.isNaN(since.valueOf())) return since;
  }
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

export async function GET(request: Request) {
  if (!requireJobSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const since = sinceFromRequest(request);
  const transferred = await prisma.user.findMany({
    where: { sombleClientProfile: { isNot: null }, role: 'MEMBER' },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      passwordHash: true,
      updatedAt: true,
      createdAt: true,
      sombleClientProfile: {
        select: {
          sourceJoinedAt: true,
          sourceStatus: true,
        },
      },
      emailMessages: {
        where: { template: 'ACCOUNT_ACTIVATION' },
        select: { status: true, sentAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  });

  const normalized = transferred.map((user) => {
    const claimed = user.status === 'ACTIVE' && Boolean(user.passwordHash);
    return {
      name: user.name,
      email: user.email,
      status: claimed ? 'ACTIVE' : 'TO BE CLAIMED',
      accountStatus: user.status,
      sourceStatus: user.sombleClientProfile?.sourceStatus || null,
      sourceJoinedAt: user.sombleClientProfile?.sourceJoinedAt?.toISOString() || null,
      updatedAt: user.updatedAt.toISOString(),
      latestActivationEmail: user.emailMessages[0]
        ? {
            status: user.emailMessages[0].status,
            sentAt: user.emailMessages[0].sentAt?.toISOString() || null,
            createdAt: user.emailMessages[0].createdAt.toISOString(),
          }
        : null,
    };
  });

  const newlyClaimed = normalized.filter(
    (user) => user.status === 'ACTIVE' && new Date(user.updatedAt) >= since,
  );
  const toBeClaimed = normalized.filter((user) => user.status === 'TO BE CLAIMED');

  return NextResponse.json({
    since: since.toISOString(),
    generatedAt: new Date().toISOString(),
    totals: {
      transferred: normalized.length,
      claimed: normalized.length - toBeClaimed.length,
      toBeClaimed: toBeClaimed.length,
      newlyClaimed: newlyClaimed.length,
    },
    newlyClaimed,
    toBeClaimed,
  });
}
