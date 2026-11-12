'use server';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import {
  changeClientArchive,
  ClientArchiveError,
} from '@/lib/domain/accounts/client-archive';

export async function changeClientArchiveAction(
  form: FormData,
): Promise<{ ok: boolean; message: string }> {
  const actor = await requireApprovedOwner();
  const userId = form.get('userId');
  const operation = form.get('operation');
  if (
    typeof userId !== 'string' ||
    !userId ||
    (operation !== 'archive' && operation !== 'restore')
  ) {
    return { ok: false, message: 'Choose a client and archive or restore.' };
  }
  try {
    await changeClientArchive(prisma, actor.id, userId, operation);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof ClientArchiveError
          ? error.message
          : 'Change not confirmed. Refresh the client record before trying again.',
    };
  }
  revalidatePath('/admin/members');
  revalidatePath(`/admin/members/${userId}`);
  return {
    ok: true,
    message: operation === 'archive' ? 'Client archived.' : 'Client restored.',
  };
}
