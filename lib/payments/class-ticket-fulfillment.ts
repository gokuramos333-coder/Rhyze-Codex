import type { Prisma } from '@prisma/client';
import { classTicketBinding, classTicketFulfillment } from '@/lib/payments/class-ticket';
import { lockMembershipEntitlements } from '@/lib/domain/credits/entitlement-lock';

/** Books only the purchased occurrence. Unfulfillable paid tickets stay visible for review/refund. */
export async function fulfillClassTicket(tx: Prisma.TransactionClient, purchaseId: string, userId: string, now = new Date()) {
  const purchase = await tx.purchase.findUniqueOrThrow({ where: { id: purchaseId } });
  const ticket = classTicketBinding(purchase.policyAcceptance);
  if (!ticket) return null;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ticket.occurrenceId}))`;
  await lockMembershipEntitlements(tx, userId);
  const fresh = await tx.purchase.findUniqueOrThrow({ where: { id: purchaseId } });
  const prior = classTicketFulfillment(fresh.policyAcceptance);
  if (prior) return prior;
  const [occurrence, existing, account] = await Promise.all([
    tx.classOccurrence.findUnique({ where: { id: ticket.occurrenceId }, include: { template: true } }),
    tx.booking.findUnique({ where: { occurrenceId_userId: { occurrenceId: ticket.occurrenceId, userId } } }),
    tx.creditAccount.findUnique({ where: { sourcePurchaseId: purchaseId }, include: { entries: true } }),
  ]);
  let reason: string | null = null;
  if (!occurrence || occurrence.status !== 'SCHEDULED' || occurrence.template.isEvent || occurrence.template.isActive === false || occurrence.startAt <= now || occurrence.startAt.toISOString() !== ticket.startAt || occurrence.endAt.toISOString() !== ticket.endAt) reason = 'The selected class is no longer available at the purchased time.';
  else if (existing) reason = 'An existing booking must be reviewed before applying this payment.';
  else if (!account || account.entries.reduce((total, entry) => total + entry.quantity, 0) !== 1) reason = 'The class ticket credit needs studio review.';
  else {
    const [occupied, overlap] = await Promise.all([
      tx.booking.count({ where: { occurrenceId: occurrence.id, status: { in: ['CONFIRMED', 'ATTENDED'] } } }),
      tx.booking.findFirst({ where: { userId, status: { in: ['CONFIRMED', 'ATTENDED'] }, occurrence: { startAt: { lt: occurrence.endAt }, endAt: { gt: occurrence.startAt } } }, select: { id: true } }),
    ]);
    if (occupied + occurrence.historicalSignupCount >= occurrence.capacity) reason = 'The class filled before payment completed.';
    else if (overlap) reason = 'The selected class overlaps another booking.';
  }
  let result: { status: 'BOOKED'; bookingId: string } | { status: 'REVIEW'; reason: string };
  if (reason) {
    result = { status: 'REVIEW', reason };
    // Preserve the paid entitlement for owner resolution; it remains bound to
    // this occurrence and cannot become a generic discounted class credit.
    if (account) await tx.creditAccount.update({ where: { id: account.id }, data: { validUntil: null } });
  } else {
    const booking = await tx.booking.create({ data: { occurrenceId: ticket.occurrenceId, userId, source: 'CLASS_TICKET', bookedAt: fresh.paidAt || now, policySnapshot: { accessType: 'STANDARD', accessProductKind: 'DROP_IN', creditAccountId: account!.id, classTicket: ticket } } });
    await tx.creditLedgerEntry.create({ data: { creditAccountId: account!.id, bookingId: booking.id, type: 'RESERVE', quantity: -1, sourceReturnKey: `class-ticket-reservation:${purchaseId}`, reason: 'Paid occurrence-specific class ticket' } });
    result = { status: 'BOOKED', bookingId: booking.id };
  }
  const policy = fresh.policyAcceptance && typeof fresh.policyAcceptance === 'object' && !Array.isArray(fresh.policyAcceptance) ? fresh.policyAcceptance : {};
  await tx.purchase.update({ where: { id: purchaseId }, data: { policyAcceptance: { ...policy, classTicketFulfillment: result } } });
  await tx.auditLog.create({ data: { action: result.status === 'BOOKED' ? 'class-ticket.booked' : 'class-ticket.fulfillment-review', entityType: 'Purchase', entityId: purchaseId, after: { userId, occurrenceId: ticket.occurrenceId, amountCents: ticket.amountCents, ...result } } });
  return result;
}
