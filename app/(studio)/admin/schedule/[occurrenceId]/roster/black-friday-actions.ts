'use server';

import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { manageBlackFridayTicket } from '@/lib/payments/black-friday-management';
import { getStripe } from '@/lib/payments/stripe';

export async function blackFridayStaffAction(form: FormData) {
  const actor = await requireArea('admin');
  const orderId = String(form.get('orderId') || '');
  const operation = form.get('operation');
  const reason = String(form.get('reason') || '').trim();
  if (!orderId || reason.length < 5 || (operation !== 'CANCEL' && operation !== 'RECONCILE')) return false;
  const expectedRefundCents = Number(form.get('expectedRefundCents'));
  if (operation === 'CANCEL' && (form.get('cancelConfirmed') !== 'on' || !Number.isSafeInteger(expectedRefundCents) || expectedRefundCents <= 0)) {
    return false;
  }

  await manageBlackFridayTicket(prisma, getStripe(), {
    actorId: actor.id, orderId, operation, reason,
    ...(operation === 'CANCEL'
      ? { expectedRefundCents }
      : { sessionId: String(form.get('sessionId') || '').trim() || undefined }),
  });

  const order = await prisma.commerceOrder.findUniqueOrThrow({ where: { id: orderId }, select: { occurrenceId: true } });
  if (order.occurrenceId) {
    revalidatePath(`/admin/schedule/${order.occurrenceId}/roster`);
    revalidatePath(`/instructor/classes/${order.occurrenceId}/roster`);
  }
  revalidatePath('/member/bookings');
  return true;
}
