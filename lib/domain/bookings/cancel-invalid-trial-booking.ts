import { lockBookingWrites } from '@/lib/domain/bookings/write-fence';
import type { Prisma } from '@prisma/client';
import { INTRO_TRIAL_DAYS } from './intro-trial-rules';

// Owner-requested correction only. No fees, credit grants, or customer mail.
export async function cancelInvalidTrialBooking(tx: Prisma.TransactionClient, input: {
  userId: string; bookingId: string; occurrenceId: string; actorId: string;
  reason: string; dryRun: boolean; now: Date;
}) {
  await lockBookingWrites(tx, input.bookingId);
  const booking = await tx.booking.findUnique({ where: { id: input.bookingId }, include: { occurrence: { include: { template: true } } } });
  if (!booking || booking.userId !== input.userId || booking.occurrenceId !== input.occurrenceId) throw Error('Booking identity changed');
  const snapshot = booking.policySnapshot as { accessType?: string; creditAccountId?: string } | null;
  if (snapshot?.accessType !== 'INTRO_TRIAL' || booking.occurrence.template.isEvent) throw Error('Not a standard trial booking');
  if (booking.status === 'CANCELLED') return { status: 'already_cancelled', bookingId: booking.id };
  if (booking.status !== 'CONFIRMED' || booking.occurrence.startAt <= input.now) throw Error('Not a future confirmed booking');
  const trials = await tx.membership.findMany({ where: {
    userId: input.userId, product: { kind: 'INTRO_TRIAL' },
    ...(snapshot.creditAccountId ? { purchase: { creditAccount: { id: snapshot.creditAccountId } } } : {}),
  } });
  // Ambiguous history requires manual review, never a guessed entitlement.
  if (trials.length !== 1 || !trials[0].activatedAt || !trials[0].currentPeriodEnd) throw Error('Trial window unavailable');
  const trial = trials[0];
  const expiresAt = new Date(Math.min(trial.currentPeriodEnd!.getTime(), trial.activatedAt!.getTime() + INTRO_TRIAL_DAYS * 86400000));
  if (booking.occurrence.startAt >= trial.activatedAt! && booking.occurrence.startAt < expiresAt) throw Error('Booking is inside trial');
  if (await tx.creditLedgerEntry.count({where:{bookingId:booking.id}}) || await tx.attendanceRecord.count({where:{bookingId:booking.id}})) throw Error('Credit or attendance requires separate review');
  if (input.dryRun) return { status:'eligible', bookingId:booking.id, trialEndsAt:expiresAt };
  await tx.booking.update({where:{id:booking.id},data:{status:'CANCELLED',cancelledAt:input.now}});
  await tx.emailMessage.updateMany({where:{dedupeKey:`class-reminder:${booking.id}:${booking.occurrenceId}`,template:'CLASS_REMINDER',status:{in:['QUEUED','PROCESSING']}},data:{status:'CANCELLED'}});
  await tx.auditLog.create({data:{actorId:input.actorId,action:'booking.invalid_trial_cancelled',entityType:'Booking',entityId:booking.id,before:{status:booking.status,occurrenceId:booking.occurrenceId},after:{status:'CANCELLED',reason:input.reason,trialEndsAt:expiresAt.toISOString(),feeCharged:false,creditsChanged:false}}});
  return {status:'cancelled',bookingId:booking.id,trialEndsAt:expiresAt};
}
