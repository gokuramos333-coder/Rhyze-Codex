'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import {
  changeAccountName,
  requestAccountEmailChange,
  IdentityError,
} from '@/lib/domain/accounts/account-identity-service';
import { createIdentityStore } from '@/lib/domain/accounts/prisma-account-identity-repository';

export async function updateAdminAccountNameAction(
  formData: FormData,
): Promise<void> {
  const actor = await requireArea('admin');
  const userId = String(formData.get('userId') || '');
  const path = `/admin/members/${encodeURIComponent(userId)}`;
  try {
    await changeAccountName(
      { actorId: actor.id, userId, name: String(formData.get('name') || '') },
      createIdentityStore(prisma),
    );
  } catch (error) {
    redirect(
      `${path}?identityError=${error instanceof IdentityError ? error.code : 'UNAVAILABLE'}`,
    );
  }
  revalidatePath(path);
  revalidatePath('/admin/members');
  revalidatePath('/member/profile');
  redirect(`${path}?identitySaved=name`);
}

export async function requestAdminAccountEmailChangeAction(
  formData: FormData,
): Promise<void> {
  const actor = await requireArea('admin');
  const userId = String(formData.get('userId') || '');
  const path = `/admin/members/${encodeURIComponent(userId)}`;
  try {
    await requestAccountEmailChange(
      {
        actorId: actor.id,
        userId,
        email: String(formData.get('email') || ''),
        currentPassword: String(formData.get('currentPassword') || ''),
      },
      createIdentityStore(prisma),
    );
  } catch (error) {
    redirect(
      `${path}?identityError=${error instanceof IdentityError ? error.code : 'UNAVAILABLE'}`,
    );
  }
  redirect(`${path}?identitySaved=email`);
}
