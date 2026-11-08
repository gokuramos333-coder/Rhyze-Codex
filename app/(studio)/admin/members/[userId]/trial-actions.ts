'use server';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { cancelAdminIntroTrial } from '@/lib/domain/memberships/cancel-intro-trial';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function cancelAdminIntroTrialAction(form: FormData) {
  const actor = await requireArea('admin');
  const userId = String(form.get('userId') || '');
  const path = `/admin/members/${encodeURIComponent(userId)}`;
  try {
    await cancelAdminIntroTrial(prisma, {
      actorId: actor.id,
      userId,
      membershipId: String(form.get('membershipId') || ''),
      confirmed: form.get('confirmed') === 'on',
      reason: String(form.get('reason') || ''),
    });
  } catch {
    redirect(`${path}?trial=review#memberships`);
  }
  revalidatePath(path);
  revalidatePath('/admin/schedule');
  revalidatePath('/member');
  revalidatePath('/member/bookings');
  redirect(`${path}?trial=cancelled#memberships`);
}
