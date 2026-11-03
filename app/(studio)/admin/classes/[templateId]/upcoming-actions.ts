'use server';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import {
  editUpcomingClasses,
  UpcomingClassEditError,
  type UpcomingClassPatch,
} from '@/lib/domain/schedule/edit-upcoming';
import { parseClassPriceCents } from '@/lib/catalog/class-pricing';
export type UpcomingEditState = { error?: string; saved?: number };
export async function editUpcomingClassesAction(
  _previous: UpcomingEditState,
  form: FormData,
): Promise<UpcomingEditState> {
  const actor = await requireArea('admin');
  const templateId = String(form.get('templateId') || '');
  const ids = form.getAll('occurrenceId').map(String);
  const patch: UpcomingClassPatch = {};
  if (form.get('changeName') === 'on')
    patch.titleOverride = String(form.get('title') || '');
  if (form.get('changeCapacity') === 'on')
    patch.capacity = Number(form.get('capacity'));
  if (form.get('changeDuration') === 'on')
    patch.durationMinutes = Number(form.get('durationMinutes'));
  if (form.get('changePrice') === 'on')
    patch.priceCents = parseClassPriceCents(form.get('price')) ?? NaN;
  if (form.get('changeInstructor') === 'on')
    patch.instructorId = String(form.get('instructorId') || '');
  if (form.get('changeNotes') === 'on')
    patch.publicNotes = String(form.get('publicNotes') || '');
  try {
    const saved = await editUpcomingClasses(prisma, {
      actorId: actor.id,
      templateId,
      selected: ids.map((id) => ({
        id,
        updatedAt: String(form.get(`version:${id}`) || ''),
      })),
      patch,
    });
    for (const path of [
      '/',
      '/schedule',
      '/classes',
      '/events',
      '/admin/classes',
      '/admin/events',
      '/instructor/schedule',
      '/member/bookings',
      `/admin/classes/${templateId}`,
    ])
      revalidatePath(path);
    for (const id of ids) {
      revalidatePath(`/admin/schedule/${id}`);
      revalidatePath(`/schedule/${id}`);
    }
    return { saved };
  } catch (error) {
    const messages = {
      invalid: 'Choose upcoming dates and enter valid changes.',
      past: 'One of these dates has already started or is no longer scheduled. Refresh and choose upcoming dates.',
      stale:
        'A selected class changed while you were editing. Refresh before saving again.',
      capacity:
        'Capacity cannot be lower than the number of people already booked.',
      conflict:
        'These changes would overlap another class for this instructor or room. Nothing was saved.',
      instructor: 'Choose an active instructor account.',
    };
    if (error instanceof UpcomingClassEditError)
      return { error: messages[error.code] };
    if ((error as { code?: string })?.code === 'P2034')
      return {
        error:
          'The schedule changed during your edit. Refresh and try again; nothing was saved.',
      };
    throw error;
  }
}
