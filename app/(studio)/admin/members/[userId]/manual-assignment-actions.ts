'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { correctManualAssignmentToClasses } from '@/lib/domain/memberships/manual-assignment-correction';

export async function correctManualMembershipAssignmentAction(form: FormData) {
  const actor = await requireApprovedOwner();
  const userId = String(form.get('userId') || '');
  try {
    await prisma.$transaction(tx => correctManualAssignmentToClasses(tx, {
      actorId: actor.id, userId,
      membershipId: String(form.get('membershipId') || ''),
      productId: String(form.get('productId') || ''),
      reason: String(form.get('reason') || ''),
    }), { isolationLevel: 'Serializable' });
  } catch {
    redirect(`/admin/members/${userId}?error=assignment-correction#memberships`);
  }
  for (const path of [`/admin/members/${userId}`, '/admin/members', '/member', '/member/membership', '/member/bookings', '/member/profile', '/schedule'])
    revalidatePath(path);
  redirect(`/admin/members/${userId}?sent=assignment-corrected#memberships`);
}
