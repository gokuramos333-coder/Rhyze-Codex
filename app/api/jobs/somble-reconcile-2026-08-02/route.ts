import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { reconcileSombleAug2 } from '@/scripts/reconcile-somble-2026-08-02';

export const maxDuration = 60;

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!process.env.JOB_SECRET || authorization !== `Bearer ${process.env.JOB_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await reconcileSombleAug2(true);
    const activationEmails = await prisma.emailMessage.findMany({
      where: {
        template: 'ACCOUNT_ACTIVATION',
        to: {
          in: [
            'witchness56@gmail.com',
            'michelle_flett@yahoo.com',
            'melissa.opitz@aol.com',
            'morganstrasser25@gmail.com',
          ],
        },
      },
      select: { to: true, status: true, sentAt: true, providerId: true },
      orderBy: { to: 'asc' },
    });
    const sampleEmail = await prisma.emailMessage.findFirst({
      where: { template: 'TEST_ACCOUNT_ACTIVATION', to: 'gui@westaffnj.com' },
      select: { to: true, status: true, sentAt: true, providerId: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ reconciled: true, report, activationEmails, sampleEmail });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Somble reconciliation failed' },
      { status: 400 },
    );
  }
}
