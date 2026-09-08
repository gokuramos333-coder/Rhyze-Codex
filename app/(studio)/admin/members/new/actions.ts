'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireApprovedOwner } from '@/lib/auth/session';
import {
  AdminClientConflictError,
  createAdminClient,
  parseAdminClientInput,
} from '@/lib/domain/accounts/admin-client-creation';
import { prismaAdminClientRepository } from '@/lib/domain/accounts/prisma-admin-client-repository';
import {
  assignAdminMembershipAction,
  startAdminMembershipCheckoutAction,
} from '../[userId]/actions';

export async function createAdminClientAction(formData: FormData) {
  const actor = await requireApprovedOwner();
  let input: ReturnType<typeof parseAdminClientInput>;
  try {
    input = parseAdminClientInput({
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      birthdayMonth: formData.get('birthdayMonth'),
      birthdayDay: formData.get('birthdayDay'),
    });
  } catch {
    redirect('/admin/members/new?error=invalid');
  }

  let member: Awaited<ReturnType<typeof createAdminClient>>;
  try {
    member = await createAdminClient({
      actorId: actor.id,
      input,
      repository: prismaAdminClientRepository,
    });
  } catch (error) {
    redirect(`/admin/members/new?error=${error instanceof AdminClientConflictError ? 'duplicate' : 'create'}`);
  }

  revalidatePath('/admin');
  revalidatePath('/admin/members');

  const productId = String(formData.get('productId') || '');
  const membershipMode = String(formData.get('membershipMode') || 'none');
  if (productId && membershipMode === 'checkout') {
    const checkout = new FormData();
    checkout.set('userId', member.id);
    checkout.set('productId', productId);
    await startAdminMembershipCheckoutAction(checkout);
  }
  if (productId && membershipMode === 'assign') {
    const assignment = new FormData();
    assignment.set('userId', member.id);
    assignment.set('productId', productId);
    assignment.set('accessEndDate', String(formData.get('accessEndDate') || ''));
    assignment.set('reason', String(formData.get('reason') || ''));
    await assignAdminMembershipAction(assignment);
  }
  redirect(`/admin/members/${member.id}?sent=client-created`);
}
