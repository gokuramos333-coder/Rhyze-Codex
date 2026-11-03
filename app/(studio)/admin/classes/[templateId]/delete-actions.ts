'use server';
import { z } from 'zod';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import {
  deleteClassSchedule,
  DeleteOccurrenceError,
} from '@/lib/domain/schedule/delete-occurrence';
const selection = z
  .array(
    z.object({
      id: z.string().min(1),
      expectedStartAt: z.string().min(1),
      expectedUpdatedAt: z.string().min(1),
      booked: z.number().int().nonnegative(),
      waiting: z.number().int().nonnegative(),
    }),
  )
  .min(1)
  .max(200);
export type DeleteScheduleState = {
  error?: string;
  removed?: number;
  alreadyRemoved?: number;
  completedAt?: string;
};
export async function deleteClassScheduleAction(
  _previous: DeleteScheduleState,
  form: FormData,
): Promise<DeleteScheduleState> {
  const actor = await requireArea('admin');
  const templateId = String(form.get('templateId') || '');
  const scope = form.get('scope');
  let dates: z.infer<typeof selection>;
  try {
    dates = selection.parse(JSON.parse(String(form.get('dates') || '[]')));
  } catch {
    return {
      error:
        'Choose the date or dates to remove, then review them before confirming.',
    };
  }
  if (!templateId || (scope !== 'one' && scope !== 'future'))
    return { error: 'Choose this date only or all future dates.' };
  try {
    const result = await deleteClassSchedule(prisma, actor.id, {
      templateId,
      scope,
      dates,
      confirmed: form.get('confirmDelete') === 'yes',
    });
    for (const path of [
      '/',
      '/classes',
      '/schedule',
      '/events',
      '/admin',
      '/admin/classes',
      '/admin/events',
      '/admin/schedule',
      '/instructor/schedule',
      '/member/bookings',
      `/admin/classes/${templateId}`,
    ])
      revalidatePath(path);
    for (const d of dates) {
      revalidatePath(`/schedule/${d.id}`);
      revalidatePath(`/admin/schedule/${d.id}`);
    }
    revalidatePath('/book/[slug]', 'page');
    return { ...result, completedAt: new Date().toISOString() };
  } catch (error) {
    const messages: Record<string, string> = {
      'delete-confirm': 'Confirm the exact dates listed before deleting.',
      'delete-invalid':
        'The selection is no longer valid. Refresh and choose the dates again.',
      'delete-missing': 'This class date no longer exists. Refresh the page.',
      'delete-stale':
        'The schedule or its signups changed. Nothing was removed. Refresh and review the updated dates and signups.',
      'delete-history':
        'A date has already started or has attendance/history that must be preserved. Nothing was removed.',
      'delete-payment':
        'A selected date has an unresolved payment that needs review first. Nothing was removed.',
    };
    if (error instanceof DeleteOccurrenceError)
      return {
        error:
          messages[error.code] ||
          'Nothing was removed. Refresh and review the selection.',
      };
    if ((error as { code?: string })?.code === 'P2034')
      return { error: messages['delete-stale'] };
    throw error;
  }
}
