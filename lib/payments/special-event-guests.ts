import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { hasPermission } from '@/lib/auth/permissions';
import { ticketBookingPolicy, type Ticket } from './black-friday-checkout';
import {
  normalizeFriendPhone,
  normalizedFriendName,
  specialEventIdentity,
} from './black-friday-new-friend';
import { inspectNewFriendHistory } from './black-friday-new-friend-history';
import { retrySerializableTransaction } from './transaction-retry';

type Tx = Prisma.TransactionClient;
export type RosterActor = { id: string };
export type PaidGuestTicket = Ticket & {
  paperWaiverVersionId: string | null;
  paperCollectedAt: Date | null;
  paperCollectedById: string | null;
  guestCheckedInAt: Date | null;
  guestCheckedInById: string | null;
};
export type GuestAccountMatch = { id: string; name: string; phone: string };

export async function rosterStaff(
  tx: Tx,
  occurrenceId: string,
  actor: RosterActor,
  accounts = false,
) {
  const staff = await tx.user.findUnique({
    where: { id: actor.id },
    select: { id: true, role: true, status: true, email: true },
  });
  const occurrence = await tx.classOccurrence.findUniqueOrThrow({
    where: { id: occurrenceId },
  });
  if (
    !staff ||
    staff.status !== 'ACTIVE' ||
    !hasPermission(staff.role, 'roster:manage-assigned') ||
    (staff.role === 'INSTRUCTOR' && occurrence.instructorId !== staff.id) ||
    (accounts && staff.role !== 'OWNER' && staff.role !== 'ADMIN')
  )
    throw Error('Staff authorization required for this roster.');
  return { staff, occurrence };
}

async function guestTransaction<T>(
  orderId: string,
  actor: RosterActor,
  accounts: boolean,
  apply: (
    tx: Tx,
    t: PaidGuestTicket,
    occurrence: Awaited<ReturnType<typeof rosterStaff>>['occurrence'],
  ) => Promise<T>,
  db: PrismaClient = prisma,
) {
  return retrySerializableTransaction(() =>
    db.$transaction(
      async (tx) => {
        const [observed] = await tx.$queryRaw<
          { occurrenceId: string }[]
        >`SELECT "occurrenceId" FROM "BlackFridayTicket" WHERE "orderId"=${orderId}`;
        if (!observed) throw Error('Ticket unavailable.');
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${observed.occurrenceId}))`;
        await tx.$queryRaw`SELECT id FROM "ClassOccurrence" WHERE id=${observed.occurrenceId} FOR UPDATE`;
        const { occurrence } = await rosterStaff(
          tx,
          observed.occurrenceId,
          actor,
          accounts,
        );
        const [t] = await tx.$queryRaw<
          PaidGuestTicket[]
        >`SELECT * FROM bf_paid_event_ticket WHERE "orderId"=${orderId} AND seats=2`;
        if (!t || occurrence.status !== 'SCHEDULED' || occurrence.archivedAt)
          throw Error('Settled guest ticket required.');
        return apply(tx, t, occurrence);
      },
      { isolationLevel: 'Serializable' },
    ),
  );
}

export async function recordGuestPaperWaiver(
  input: { orderId: string; displayedWaiverVersionId: string },
  actor: RosterActor,
) {
  return guestTransaction(input.orderId, actor, false, async (tx, t) => {
    const [waiver] = await tx.$queryRaw<
      { id: string | null }[]
    >`SELECT bf_current_waiver() AS id`;
    if (!waiver.id || waiver.id !== input.displayedWaiverVersionId)
      throw Error('The waiver has changed. Reload the current waiver.');
    if (t.paperWaiverVersionId !== waiver.id) {
      const [receipt] = await tx.$queryRaw<
        { paperCollectedAt: Date }[]
      >`UPDATE "BlackFridayTicket" SET "paperWaiverVersionId"=${waiver.id},"paperCollectedById"=${actor.id},"paperCollectedAt"=clock_timestamp() AT TIME ZONE 'UTC' WHERE "orderId"=${t.orderId} RETURNING "paperCollectedAt"`;
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          entityType: 'CommerceOrder',
          entityId: t.orderId,
          action: 'special-event.paper-collected',
          ...(t.paperCollectedAt
            ? {
                before: {
                  waiverVersionId: t.paperWaiverVersionId,
                  collectedAt: t.paperCollectedAt.toISOString(),
                  actorId: t.paperCollectedById,
                },
              }
            : {}),
          after: {
            waiverVersionId: waiver.id,
            collectedAt: receipt.paperCollectedAt.toISOString(),
          },
        },
      });
    }
    return { occurrenceId: t.occurrenceId };
  });
}
async function transferAttendance(
  tx: Tx,
  t: PaidGuestTicket,
  userId: string,
  bookingId: string,
) {
  await tx.attendanceRecord.create({
    data: {
      bookingId,
      userId,
      occurrenceId: t.occurrenceId,
      status: 'CHECKED_IN',
      markedById: t.guestCheckedInById,
      checkedInAt: t.guestCheckedInAt,
    },
  });
}
export async function checkInGuest(
  input: { orderId: string },
  actor: RosterActor,
) {
  return guestTransaction(input.orderId, actor, false, async (tx, t) => {
    const result = { occurrenceId: t.occurrenceId };
    const native = t.guestBookingId
      ? await tx.attendanceRecord.findUnique({
          where: { bookingId: t.guestBookingId },
        })
      : null;
    if (native) {
      if (native.status === 'CHECKED_IN' || native.status === 'ATTENDED')
        return result;
      throw Error('Review the existing attendance mark.');
    }
    if (!t.guestBookingId && t.guestCheckedInAt) return result;
    const [current] = await tx.$queryRaw<
      PaidGuestTicket[]
    >`UPDATE "BlackFridayTicket" t SET "guestCheckedInAt"=clock_timestamp() AT TIME ZONE 'UTC',
      "guestCheckedInById"=${actor.id} WHERE t."orderId"=${t.orderId} AND bf_guest_waiver_valid(t) RETURNING t.*`;
    if (!current) throw Error('A current signed waiver is required.');
    if (t.guestBookingId && t.guestUserId)
      await transferAttendance(tx, current, t.guestUserId, t.guestBookingId);
    return result;
  });
}

export async function searchGuestAccounts(
  input: { orderId: string; query: string },
  actor: RosterActor,
): Promise<GuestAccountMatch[]> {
  return guestTransaction(input.orderId, actor, true, async (tx, t) => {
    const query = normalizedFriendName(input.query);
    if (query.length < 2 || query.length > 120) return [];
    const name = normalizedFriendName(t.guestName!);
    const digits = t.guestPhone!.slice(1);
    const domestic =
      digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    return tx.$queryRaw<
      GuestAccountMatch[]
    >`SELECT u.id,u.name,p.phone FROM "User" u JOIN "MemberProfile" p ON p."userId"=u.id
       WHERE u.status='ACTIVE' AND u.id<>${t.userId} AND u.name IS NOT NULL AND p.phone IS NOT NULL
       AND lower(regexp_replace(trim(normalize(u.name,NFKC)), '\\s+', ' ', 'g'))=${name}
       AND regexp_replace(p.phone,'[^0-9]','','g') IN (${digits},${domestic})
       AND (strpos(lower(normalize(u.name,NFKC)),${query})>0 OR strpos(regexp_replace(p.phone,'[^0-9]','','g'),nullif(regexp_replace(${query},'[^0-9]','','g'),''))>0)
       ORDER BY u.name,u.id LIMIT 8`;
  });
}

export async function linkGuestAccount(
  input: {
    orderId: string;
    selectedUserId: string;
    identityConfirmed: boolean;
  },
  actor: RosterActor,
  db: PrismaClient = prisma,
  now = new Date(),
) {
  return guestTransaction(
    input.orderId,
    actor,
    true,
    async (tx, t, o) => {
      if (!input.identityConfirmed)
        throw Error('Confirm guest identity before linking.');
      const user = await tx.user.findUnique({
        where: { id: input.selectedUserId },
        include: { memberProfile: true },
      });
      if (
        !user ||
        user.status !== 'ACTIVE' ||
        user.id === t.userId ||
        !user.name ||
        normalizeFriendPhone(user.memberProfile?.phone) !== t.guestPhone ||
        normalizedFriendName(user.name) !== normalizedFriendName(t.guestName!)
      )
        throw Error('Account contact must match the paid guest.');
      if (t.guestUserId) {
        if (t.guestUserId !== user.id || !t.guestBookingId)
          throw Error('The seat is already linked.');
        return { occurrenceId: t.occurrenceId };
      }
      if (
        specialEventIdentity(t.occurrenceId)?.requiresFirstVisit &&
        (
          await inspectNewFriendHistory(
            tx,
            { fullName: t.guestName!, phone: t.guestPhone! },
            t.userId,
            now,
            true,
            t.orderId,
          )
        ).status !== 'ELIGIBLE'
      )
        throw Error('First-visit eligibility needs staff review.');
      if (
        (await tx.booking.findUnique({
          where: {
            occurrenceId_userId: {
              occurrenceId: t.occurrenceId,
              userId: user.id,
            },
          },
        })) ||
        (
          await tx.$queryRaw<
            { id: number }[]
          >`SELECT 1 FROM "BlackFridayTicket" WHERE "orderId"<>${t.orderId} AND "occurrenceId"=${t.occurrenceId}
        AND state NOT IN ('EXPIRED','REFUNDED','DISPUTE_LOST') AND ${user.id} IN ("userId","guestUserId")`
        ).length
      )
        throw Error('Existing booking needs staff review.');
      const bookingId = randomUUID();
      const order = await tx.commerceOrder.findUniqueOrThrow({
        where: { id: t.orderId },
      });
      await tx.$executeRaw`UPDATE "BlackFridayTicket" SET "guestUserId"=${user.id},"guestBookingId"=${bookingId} WHERE "orderId"=${t.orderId}`;
      await tx.booking.create({
        data: {
          id: bookingId,
          occurrenceId: t.occurrenceId,
          userId: user.id,
          source: 'STRIPE_EVENT',
          policySnapshot: ticketBookingPolicy(
            t.orderId,
            'GUEST',
            o,
            order.amountCents,
          ),
        },
      });
      if (t.guestCheckedInAt) {
        // Scope the historical-waiver exception to this exact linking insert.
        await tx.$queryRaw`SELECT set_config('rhyze.transferring_guest_order',${t.orderId},true)`;
        await transferAttendance(tx, t, user.id, bookingId);
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'black-friday.guest-claimed',
          entityType: 'CommerceOrder',
          entityId: t.orderId,
          after: { userId: user.id, identityConfirmed: true },
        },
      });
      return { occurrenceId: t.occurrenceId };
    },
    db,
  );
}
