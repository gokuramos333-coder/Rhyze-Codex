'use server';

import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { checkInGuest, linkGuestAccount, recordGuestPaperWaiver, searchGuestAccounts } from '@/lib/payments/special-event-guests';

function revalidateRoster(occurrenceId: string) {
  revalidatePath(`/admin/schedule/${occurrenceId}/roster`);
  revalidatePath(`/instructor/classes/${occurrenceId}/roster`);
}

export async function recordPaperWaiverAction(input: {
  orderId: string;
  displayedWaiverVersionId: string;
  paperCollected: boolean;
}) {
  const { id } = await requireArea('instructor');
  if (input.paperCollected !== true) return false;
  const { occurrenceId } = await recordGuestPaperWaiver(
    { orderId: input.orderId, displayedWaiverVersionId: input.displayedWaiverVersionId }, { id },
  );
  revalidateRoster(occurrenceId);
  return true;
}

export async function checkInAction(input: { orderId: string }) {
  const { id } = await requireArea('instructor');
  const { occurrenceId } = await checkInGuest({ orderId: input.orderId }, { id });
  revalidateRoster(occurrenceId);
  return true;
}

export async function searchAccountsAction(input: { orderId: string; query: string }) {
  const { id } = await requireArea('admin');
  return searchGuestAccounts({ orderId: input.orderId, query: input.query }, { id });
}

export async function linkAccountAction(input: {
  orderId: string;
  selectedUserId: string;
  identityConfirmed: boolean;
}) {
  const { id } = await requireArea('admin');
  if (input.identityConfirmed !== true) return false;
  const { occurrenceId } = await linkGuestAccount({
    orderId: input.orderId, selectedUserId: input.selectedUserId, identityConfirmed: true,
  }, { id });
  revalidateRoster(occurrenceId);
  revalidatePath('/member/bookings');
  return true;
}
