import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!process.env.JOB_SECRET || authorization !== `Bearer ${process.env.JOB_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const due = await prisma.emailMessage.findMany({
    where: { status: 'QUEUED', scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: 'asc' },
    take: 50,
  });
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ queued: due.length, delivered: 0, status: 'Email provider not connected.' });
  }
  return NextResponse.json({ queued: due.length, delivered: 0, status: 'Provider adapter pending sender verification.' });
}
