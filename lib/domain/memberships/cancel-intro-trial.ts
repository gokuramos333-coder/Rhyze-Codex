import { Prisma, type PrismaClient } from '@prisma/client';
import { canAccessArea } from '@/lib/auth/authorization';
import { lockMembershipEntitlements } from '@/lib/domain/credits/entitlement-lock';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';
import {
  canCancelIntroTrial,
  trialBookingScope,
} from './intro-trial-cancellation-policy';

type Input = {
  actorId: string;
  userId: string;
  membershipId: string;
  confirmed: boolean;
  reason: string;
};
class RosterChanged extends Error {}
const action = 'membership.intro_trial_cancelled';

/** No provider calls, refunds, credits or email sends. All local effects and the
 * replay receipt commit together. Callers supply the authenticated actor ID. */
export async function cancelAdminIntroTrial(db: PrismaClient, input: Input) {
  const reason = input.reason.trim();
  if (!input.confirmed || reason.length < 3 || reason.length > 240)
    throw Error('Confirm cancellation and enter a reason (3–240 characters).');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await retrySerializableTransaction(() =>
        db.$transaction(
          async (tx) => {
            const actor = await tx.user.findUnique({
              where: { id: input.actorId },
            });
            if (
              !actor ||
              actor.status !== 'ACTIVE' ||
              !canAccessArea(actor.role, 'admin')
            )
              throw Error('Not authorized to cancel trials.');
            // Historical bookings remain unchanged. Lock their rosters and funding
            // before proving ownership, including concurrent restoration writers.
            const bookingWhere = { userId: input.userId };
            const initial = await tx.booking.findMany({
              where: bookingWhere,
              select: { id: true, occurrenceId: true },
            });
            const occurrenceIds = [
              ...new Set(initial.map((b) => b.occurrenceId)),
            ].sort();
            // Booking/cancellation writers take occurrence locks before entitlement locks.
            // Never acquire another occurrence lock after acquiring the entitlement lock.
            for (const id of occurrenceIds)
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
            // Event fulfillment holds the booking advisory lock before its admission
            // trigger locks the occurrence row. Match that order to avoid deadlocks.
            for (const id of initial.map((b) => b.id).sort())
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
            for (const id of occurrenceIds) {
              // Schedule edits also use row locks; the occurrence date must stay
              // historical for the duration of this decision.
              await tx.$queryRaw`SELECT id FROM "ClassOccurrence" WHERE id = ${id} FOR UPDATE NOWAIT`;
            }
            await lockMembershipEntitlements(tx, input.userId);
            const identity = await tx.membership.findFirst({
              where: { id: input.membershipId, userId: input.userId },
              select: { purchaseId: true },
            });
            if (!identity?.purchaseId)
              throw Error('Trial purchase provenance needs review.');
            // Refund settlement writes Purchase before Membership. NOWAIT also prevents
            // a legacy financial writer from waiting on our user/entitlement row while
            // we wait on its financial rows. Abort locally; never abort its settlement.
            await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${identity.purchaseId} FOR UPDATE NOWAIT`;
            await tx.$queryRaw`SELECT id FROM "Membership" WHERE id = ${input.membershipId} AND "userId" = ${input.userId} FOR UPDATE NOWAIT`;
            await tx.$queryRaw`SELECT id FROM "CreditAccount" WHERE "sourcePurchaseId" = ${identity.purchaseId} FOR UPDATE NOWAIT`;
            const membership = await tx.membership.findFirst({
              where: { id: input.membershipId, userId: input.userId },
              include: {
                product: true,
                purchase: { include: { creditAccount: true } },
              },
            });
            if (!membership || membership.purchaseId !== identity.purchaseId)
              throw Error('Trial identity changed. Review this client.');
            const previous = await tx.auditLog.findFirst({
              where: {
                action,
                entityType: 'Membership',
                entityId: membership.id,
              },
            });
            if (previous && membership.status === 'CANCELLED')
              return {
                status: 'already_cancelled' as const,
                auditId: previous.id,
              };
            const now = new Date();
            if (!canCancelIntroTrial(membership, now))
              throw Error(
                'Only an active or paused unexpired 7-day intro trial can be cancelled here.',
              );
            if (
              membership.billingLockToken ||
              membership.billingLockNeedsReview ||
              (await tx.membershipPlanChange.findUnique({
                where: { activeMembershipId: membership.id },
              }))
            )
              throw Error('A billing change needs review before cancellation.');
            if (
              await tx.membershipFreeze.count({
                where: {
                  membershipId: membership.id,
                  cancelledAt: null,
                  resumedAt: null,
                },
              })
            )
              throw Error(
                'A pending or active freeze needs review before cancellation.',
              );
            const purchase = membership.purchase;
            const account = purchase?.creditAccount;
            if (
              !purchase ||
              !account ||
              purchase.userId !== input.userId ||
              purchase.productId !== membership.productId ||
              account.userId !== input.userId ||
              !account.isUnlimited ||
              !['PAID', 'PARTIALLY_REFUNDED'].includes(purchase.status)
            )
              throw Error('Trial purchase and credit provenance need review.');
            const trialCount = await tx.membership.count({
              where: { userId: input.userId, product: { kind: 'INTRO_TRIAL' } },
            });
            const bookings = await tx.booking.findMany({
              where: bookingWhere,
              include: { occurrence: { include: { template: true } } },
            });
            if (
              bookings.some(
                (b) =>
                  !occurrenceIds.includes(b.occurrenceId) ||
                  !initial.some((old) => old.id === b.id),
              )
            )
              throw new RosterChanged(
                'The booking roster changed. Retry cancellation.',
              );
            const entries = await tx.creditLedgerEntry.findMany({
              where: { OR: [
                { bookingId: { in: bookings.map((b) => b.id) } },
                { sourceReturnKey: `returned-credit:RHYZE:${purchase.id}` },
              ] },
            });
            if (entries.some((e) => e.sourceReturnKey === `returned-credit:RHYZE:${purchase.id}`))
              throw Error('A returned trial purchase credit needs review before cancellation.');
            const preservedBookingIds: string[] = [];
            for (const booking of bookings) {
              const scope = trialBookingScope(booking.policySnapshot, account.id, trialCount);
              const funding = entries.filter((e) => e.bookingId === booking.id);
              if (scope === 'review' ||
                  (scope === 'preserve' && funding.some((e) => e.creditAccountId === account.id)))
                throw Error('Ambiguous booking funding needs review before cancellation.');
              if (scope === 'cancel') {
                // Dates, not stale SCHEDULED/CONFIRMED labels, identify history.
                // Future and in-progress classes need their own booking policy.
                if (booking.occurrence.endAt > now || booking.occurrence.startAt >= now)
                  throw Error('Future or in-progress trial booking history needs review before cancellation.');
                if (funding.some((e) => e.creditAccountId !== account.id))
                  throw Error('Conflicting or restored booking credits need review before cancellation.');
                preservedBookingIds.push(booking.id);
                continue;
              }
              const snapshot = booking.policySnapshot as { creditAccountId?: string; accessType?: string };
              if (snapshot.creditAccountId) {
                const other = await tx.creditAccount.findFirst({
                  where: { id: snapshot.creditAccountId, userId: input.userId },
                  include: { sourcePurchase: { include: { membership: true, product: true } } },
                });
                if (!other || (snapshot.accessType === 'INTRO_TRIAL' &&
                    (other.sourcePurchase?.product.kind !== 'INTRO_TRIAL' ||
                     !other.sourcePurchase.membership || other.sourcePurchase.membership.id === membership.id)))
                  throw Error('Unrelated booking funding cannot be proven. Review before cancelling the trial.');
              }
            }
            const messagesWhere: Prisma.EmailMessageWhereInput = {
              userId: input.userId,
              status: { in: ['QUEUED', 'PROCESSING'] },
              OR: [
                {
                  template: 'TRIAL_ENDING',
                  dedupeKey: `trial-ending:${membership.id}`,
                },
              ],
            };
            const messages = await tx.emailMessage.findMany({
              where: messagesWhere,
              select: { id: true },
            });
            // The sender claims QUEUED rows with a conditional UPDATE. Row locks make
            // cancellation win before a claim, or stop us if sending already began.
            for (const message of messages.sort((a, b) =>
              a.id.localeCompare(b.id),
            )) {
              await tx.$queryRaw`SELECT id FROM "EmailMessage" WHERE id = ${message.id} FOR UPDATE NOWAIT`;
            }
            if (
              await tx.emailMessage.count({
                where: {
                  id: { in: messages.map((m) => m.id) },
                  status: 'PROCESSING',
                },
              })
            )
              throw Error(
                'A trial email is already sending; review delivery before cancellation.',
              );
            await tx.membership.update({
              where: { id: membership.id },
              data: {
                status: 'CANCELLED',
                cancelAtPeriodEnd: false,
                currentPeriodEnd: now,
              },
            });
            await tx.creditAccount.update({
              where: { id: account.id },
              data: { validUntil: account.validUntil && account.validUntil < now ? account.validUntil : now },
            });
            await tx.emailMessage.updateMany({
              where: {
                id: { in: messages.map((m) => m.id) },
                status: 'QUEUED',
              },
              data: { status: 'CANCELLED' },
            });
            const audit = await tx.auditLog.create({
              data: {
                actorId: actor.id,
                action,
                entityType: 'Membership',
                entityId: membership.id,
                before: {
                  status: membership.status,
                  currentPeriodEnd:
                    membership.currentPeriodEnd?.toISOString() ?? null,
                  creditValidUntil: account.validUntil?.toISOString() ?? null,
                },
                after: {
                  status: 'CANCELLED',
                  userId: input.userId,
                  purchaseId: purchase.id,
                  creditAccountId: account.id,
                  cancelledAt: now.toISOString(),
                  reason,
                  bookingIds: [],
                  preservedBookingIds: preservedBookingIds.sort(),
                  feeCharged: false,
                  refundIssued: false,
                  emailSent: false,
                },
              },
            });
            return { status: 'cancelled' as const, auditId: audit.id };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
            timeout: 15000,
          },
        ),
      );
    } catch (error) {
      if (!(error instanceof RosterChanged) || attempt === 2) throw error;
    }
  }
  throw Error('The booking roster changed. Review and retry.');
}
