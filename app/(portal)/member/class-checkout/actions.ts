'use server';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';
import { ClassTicketCheckoutError, startClassTicketCheckout } from '@/lib/payments/class-ticket-checkout';

export async function startClassTicketCheckoutAction(formData: FormData) {
  const user = await requireArea('member');
  const occurrenceId = String(formData.get('occurrenceId') || '');
  const destination = `/member/class-checkout?occurrence=${encodeURIComponent(occurrenceId)}`;
  if (!stripeIsConfigured()) redirect(`${destination}&result=unavailable`);
  let url: string;
  try {
    url = await startClassTicketCheckout(prisma, getStripe(), { userId: user.id, occurrenceId, origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001' });
  } catch (error) {
    if (error instanceof ClassTicketCheckoutError) {
      if (error.code === 'waiver') redirect(`/member/waiver?returnTo=${encodeURIComponent(destination)}`);
      if (error.code === 'already-paid') redirect(`${destination}&result=review`);
      if (error.code === 'already-booked') redirect('/member/bookings');
      redirect(`${destination}&result=${error.code}`);
    }
    console.error('Class ticket checkout failed', { occurrenceId, userId: user.id, error: error instanceof Error ? error.message : 'Unknown error' });
    redirect(`${destination}&result=error`);
  }
  redirect(url);
}
