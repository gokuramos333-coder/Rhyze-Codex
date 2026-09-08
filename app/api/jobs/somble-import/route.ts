import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import {
  applySombleImportJob,
  applySombleRosterJob,
  isSombleImportAuthorized,
  parseSombleImportJobPayload,
  parseSombleRosterJobPayload,
} from '@/lib/import/somble-import-job';

export const maxDuration = 60;

export async function POST(request: Request) {
  if (
    !isSombleImportAuthorized(request.headers.get('authorization'), {
      jobSecret: process.env.JOB_SECRET,
      importSecret: process.env.SOMBLE_IMPORT_SECRET,
    })
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result =
      body && typeof body === 'object' && Array.isArray(body.rosters)
        ? await applySombleRosterJob(
            prisma,
            parseSombleRosterJobPayload(body),
          )
        : await applySombleImportJob(
            prisma,
            parseSombleImportJobPayload(body),
          );
    return NextResponse.json({ imported: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Somble import failed',
      },
      { status: 400 },
    );
  }
}
