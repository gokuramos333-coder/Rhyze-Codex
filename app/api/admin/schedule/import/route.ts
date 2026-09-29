import { NextResponse } from 'next/server';
import { isTrustedAdminOrigin } from '@/lib/auth/request-origin';
import { revalidatePath } from 'next/cache';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { importSchedule, scheduleImportSchema } from '@/lib/admin/schedule-import';

export async function POST(request: Request) {
  if (!isTrustedAdminOrigin(request)) return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  const owner = await requireApprovedOwner();
  const input = scheduleImportSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Invalid schedule import.' }, { status: 400 });
  try {
    const result = await importSchedule(prisma, input.data, owner.id);
    if (!input.data.dryRun) for (const path of ['/schedule', '/admin/schedule', '/admin/events', '/instructor/schedule']) revalidatePath(path);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Schedule import failed.' }, { status: 409 });
  }
}
