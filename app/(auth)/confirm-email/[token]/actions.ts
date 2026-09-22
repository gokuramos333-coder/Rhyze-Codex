'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import {
  confirmAccountEmailChange,
  IdentityError,
} from '@/lib/domain/accounts/account-identity-service';
import { createIdentityStore } from '@/lib/domain/accounts/prisma-account-identity-repository';

export async function confirmAccountEmailAction(token: string): Promise<void> {
  try {
    await confirmAccountEmailChange(token, createIdentityStore(prisma));
  } catch (error) {
    const code = error instanceof IdentityError ? error.code : 'UNAVAILABLE';
    redirect(
      `/confirm-email/${encodeURIComponent(token.slice(0, 100))}?error=${code}`,
    );
  }
  revalidatePath('/member/profile');
  revalidatePath('/admin/members', 'layout');
  redirect('/email-confirmed');
}
