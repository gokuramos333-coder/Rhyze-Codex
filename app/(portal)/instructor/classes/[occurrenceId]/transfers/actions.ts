'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { evaluateTransferWindow } from '@/lib/domain/transfers/transfer-policy';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';
import { queueEmail } from '@/lib/notifications/email-queue';

export async function transferBookingAction(formData: FormData) {
  const instructor = await requireArea('instructor');
  const bookingId = String(formData.get('bookingId') || '');
  const destinationId = String(formData.get('destinationId') || '');
  const reason = String(formData.get('reason') || '').trim() || null;
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { user: true, occurrence: true },
  });
  if (!booking || booking.status !== 'CONFIRMED' || booking.occurrence.instructorId !== instructor.id) {
    redirect(`/instructor/classes/${formData.get('occurrenceId')}/roster`);
  }
  const vip = await prisma.membership.findFirst({
    where: { userId: booking.userId, status: { in: ['ACTIVE','TRIALING'] }, product: { kind: 'VIP' } },
  });
  const policy = evaluateTransferWindow(booking.occurrence.startAt, new Date(), Boolean(vip));
  if (policy === 'BLOCKED') {
    await prisma.$transaction([
      prisma.booking.update({ where: { id: booking.id }, data: { status: 'LATE_CANCELLED', cancelledAt: new Date() } }),
      prisma.bookingTransfer.create({ data: { bookingId, memberId: booking.userId, instructorId: instructor.id, fromOccurrenceId: booking.occurrenceId, status: 'BLOCKED', reason } }),
    ]);
    redirect(`/instructor/classes/${booking.occurrenceId}/roster?transfer=blocked`);
  }
  let paymentIntentId: string | undefined;
  if (policy === 'FEE_1000') {
    if (!stripeIsConfigured() || !booking.user.stripeCustomerId) {
      redirect(`/instructor/classes/${booking.occurrenceId}/transfers?booking=${booking.id}&error=payment`);
    }
    try {
      const stripe = getStripe();
      const customer = await stripe.customers.retrieve(booking.user.stripeCustomerId);
      if (customer.deleted || !customer.invoice_settings.default_payment_method) throw new Error('No saved payment method');
      const paymentMethod = typeof customer.invoice_settings.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings.default_payment_method.id;
      const payment = await stripe.paymentIntents.create({
        amount: 1_000,
        currency: 'usd',
        customer: booking.user.stripeCustomerId,
        payment_method: paymentMethod,
        confirm: true,
        off_session: true,
        description: 'Rhyze class transfer fee',
        metadata: { bookingId, instructorId: instructor.id },
      }, { idempotencyKey: `transfer-fee-${booking.id}-${destinationId}` });
      paymentIntentId = payment.id;
    } catch {
      await prisma.bookingTransfer.create({ data: { bookingId, memberId: booking.userId, instructorId: instructor.id, fromOccurrenceId: booking.occurrenceId, toOccurrenceId: destinationId, status: 'PAYMENT_FAILED', feeCents: 1_000, reason } });
      redirect(`/instructor/classes/${booking.occurrenceId}/transfers?booking=${booking.id}&error=payment`);
    }
  }
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${destinationId}))`;
    const destination = await tx.classOccurrence.findFirst({ where: { id: destinationId, status: 'SCHEDULED' } });
    if (!destination || destination.startAt > new Date(booking.occurrence.startAt.getTime() + 14 * 24 * 60 * 60_000) || destination.startAt < new Date()) return false;
    const occupied = await tx.booking.count({ where: { occurrenceId: destinationId, status: 'CONFIRMED' } });
    if (occupied >= destination.capacity) return false;
    const overlap = await tx.booking.findFirst({ where: { userId: booking.userId, id: { not: booking.id }, status: 'CONFIRMED', occurrence: { startAt: { lt: destination.endAt }, endAt: { gt: destination.startAt } } } });
    if (overlap) return false;
    await tx.booking.update({ where: { id: booking.id }, data: { occurrenceId: destinationId, policySnapshot: { transferredFrom: booking.occurrenceId, transferredAt: new Date().toISOString() } } });
    await tx.bookingTransfer.create({ data: { bookingId, memberId: booking.userId, instructorId: instructor.id, fromOccurrenceId: booking.occurrenceId, toOccurrenceId: destinationId, status: 'COMPLETED', feeCents: policy === 'FEE_1000' ? 1_000 : 0, stripePaymentIntentId: paymentIntentId, reason } });
    await queueEmail(tx, { userId: booking.userId, to: booking.user.email, subject: 'Your Rhyze class transfer is confirmed', template: 'BOOKING_TRANSFERRED', payload: { bookingId, fromOccurrenceId: booking.occurrenceId, toOccurrenceId: destinationId } });
    return true;
  });
  if (!outcome) redirect(`/instructor/classes/${booking.occurrenceId}/transfers?booking=${booking.id}&error=destination`);
  revalidatePath(`/instructor/classes/${booking.occurrenceId}/roster`);
  redirect(`/instructor/classes/${destinationId}/roster?transfer=complete`);
}
