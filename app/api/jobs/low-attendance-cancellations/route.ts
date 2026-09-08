import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { cancelLowAttendanceOccurrences } from '@/lib/domain/schedule/low-attendance-cancellations';

export async function POST(request: Request) {
  if (
    !process.env.JOB_SECRET ||
    request.headers.get('authorization') !== `Bearer ${process.env.JOB_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await cancelLowAttendanceOccurrences(prisma);
  return NextResponse.json(result);
}
