import { Prisma, type PrismaClient } from '@prisma/client';
import { isApprovedOwner } from '@/lib/auth/owner-access';

type Database = PrismaClient | Prisma.TransactionClient;
export type ClientArchiveState = {
  archived: boolean;
  effectivelyArchived: boolean;
  reasons: string[];
};
export class ClientArchiveError extends Error {}

// Shared by both reads and writes: obligations created after archive make the
// client visible immediately, without changing billing/booking admission paths.
// u is the User row in the enclosing parameterized query.
function archiveReasonsSql(now: Date) {
  // planChangeState and Stripe customer identity survive settled billing;
  // current membership, operation and payment records establish obligations.
  return Prisma.sql`array_remove(ARRAY[
    CASE WHEN u.role <> 'MEMBER' THEN 'Only MEMBER clients can be archived' END,
    CASE WHEN
      EXISTS (SELECT 1 FROM "Membership" m WHERE m."userId"=u.id AND
        (m.status IN ('TRIALING','ACTIVE','PAST_DUE','PAUSED') OR m."billingLockNeedsReview" OR m."billingLockToken" IS NOT NULL))
      OR EXISTS (SELECT 1 FROM "Purchase" p WHERE p."userId"=u.id AND p.status='PENDING')
      OR EXISTS (SELECT 1 FROM "PaymentRecord" p WHERE
        (p."userId"=u.id OR (p."userId" IS NULL AND lower(btrim(p."customerEmail"))=lower(btrim(u.email))))
        AND p.status IN ('FAILED','DISPUTED'))
      OR EXISTS (SELECT 1 FROM "CommerceOrder" o WHERE
        (o."userId"=u.id OR (o."userId" IS NULL AND lower(btrim(o."customerEmail"))=lower(btrim(u.email))))
        AND (o.status IN ('PENDING','PAYMENT_FAILED','FULFILLMENT_REVIEW','DISPUTED')
          OR EXISTS (SELECT 1 FROM "CommerceRefund" r WHERE r."commerceOrderId"=o.id AND r.status NOT IN ('SUCCEEDED','CANCELLED'))))
      OR EXISTS (SELECT 1 FROM "MembershipChangeRequest" r WHERE r."userId"=u.id AND r.status='PENDING')
      OR EXISTS (SELECT 1 FROM "MembershipPlanChange" p JOIN "Membership" m ON m.id=p."membershipId" WHERE m."userId"=u.id AND p."activeMembershipId" IS NOT NULL)
      OR EXISTS (SELECT 1 FROM "MembershipFreeze" f JOIN "Membership" m ON m.id=f."membershipId" WHERE m."userId"=u.id AND f."cancelledAt" IS NULL AND f."resumedAt" IS NULL)
      THEN 'Active billing or unresolved payment' END,
    CASE WHEN
      EXISTS (SELECT 1 FROM "Booking" b JOIN "ClassOccurrence" o ON o.id=b."occurrenceId" WHERE b."userId"=u.id AND b.status='CONFIRMED' AND o.status='SCHEDULED' AND o."endAt">${now})
      OR EXISTS (SELECT 1 FROM "WaitlistEntry" w JOIN "ClassOccurrence" o ON o.id=w."occurrenceId" WHERE w."userId"=u.id AND w.status='WAITING' AND o.status='SCHEDULED' AND o."endAt">${now})
      THEN 'Future bookings or waitlist' END,
    CASE WHEN EXISTS (SELECT 1 FROM "CreditAccount" c WHERE c."userId"=u.id AND (
      ((c."validUntil" IS NULL OR c."validUntil">${now}) AND
        (c."isUnlimited" OR COALESCE((SELECT sum(e.quantity) FROM "CreditLedgerEntry" e WHERE e."creditAccountId"=c.id),0) <> 0))
      -- Attendance and late cancellation consume the reservation by booking
      -- status, without a CONSUME entry. Otherwise use the net debit per
      -- booking/account so an earlier return cannot hide a later reservation.
      OR EXISTS (SELECT 1 FROM "CreditLedgerEntry" e WHERE e."creditAccountId"=c.id
        AND e.type IN ('RESERVE','RELEASE','RESTORE')
        AND NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b.id=e."bookingId" AND b.status IN ('ATTENDED','NO_SHOW','LATE_CANCELLED'))
        GROUP BY e."bookingId" HAVING sum(e.quantity) < 0)
    )) THEN 'Credits or access obligations' END
  ]::text[], NULL)`;
}

export async function getClientArchive(
  db: Database,
  userId: string,
): Promise<ClientArchiveState> {
  const [row] = await db.$queryRaw<
    { archivedAt: Date | null; reasons: string[] }[]
  >(Prisma.sql`
    SELECT u."archivedAt", ${archiveReasonsSql(new Date())} AS reasons FROM "User" u WHERE u.id=${userId}`);
  if (!row) throw new ClientArchiveError('Client not found.');
  return {
    archived: Boolean(row.archivedAt),
    effectivelyArchived: Boolean(row.archivedAt) && row.reasons.length === 0,
    reasons: row.reasons,
  };
}

export async function clientArchiveVisibilityWhere(
  db: Database,
  view?: string,
): Promise<Prisma.UserWhereInput> {
  if (view === 'all') return {};
  const hidden = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT u.id FROM "User" u WHERE u."archivedAt" IS NOT NULL AND cardinality(${archiveReasonsSql(new Date())})=0`);
  const ids = hidden.map((row) => row.id);
  return { id: view === 'archived' ? { in: ids } : { notIn: ids } };
}

export async function changeClientArchive(
  db: PrismaClient,
  actorId: string,
  userId: string,
  operation: 'archive' | 'restore',
): Promise<void> {
  if (operation !== 'archive' && operation !== 'restore')
    throw new ClientArchiveError('Invalid archive operation.');
  await db.$transaction(
    async (tx) => {
      // Local row locks serialize archive/restore and keep authorization current.
      // No global locks, admission triggers, or changes to customer write paths.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id IN (${actorId}, ${userId}) ORDER BY id FOR UPDATE`;
      const actor = await tx.user.findUnique({ where: { id: actorId } });
      if (!actor || !isApprovedOwner(actor))
        throw new ClientArchiveError('Not authorized.');
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw new ClientArchiveError('Client not found.');
      if (target.role !== 'MEMBER' || target.id === actorId)
        throw new ClientArchiveError(
          'Only MEMBER client records can be managed here.',
        );
      const state = await getClientArchive(tx, userId);
      if (operation === 'archive' && state.reasons.length)
        throw new ClientArchiveError(state.reasons.join('; '));
      const archived = operation === 'archive';
      if (state.archived === archived) return;
      await tx.user.update({
        where: { id: userId },
        data: { archivedAt: archived ? new Date() : null },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: archived
            ? 'client.directory.archived'
            : 'client.directory.restored',
          entityType: 'User',
          entityId: userId,
          before: { archived: state.archived },
          after: { archived },
        },
      });
    },
    { maxWait: 5000, timeout: 15000 },
  );
}
