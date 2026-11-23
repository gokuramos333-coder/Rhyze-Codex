import type { PrismaClient, Prisma } from '@prisma/client';
import { assessNewFriend, normalizeFriendPhone, normalizedFriendName, type FriendHistoryCandidate } from './black-friday-new-friend';

/** Read-only internal evidence lookup. Does not authenticate, reserve or approve a guest. */
export async function inspectNewFriendHistory(db: PrismaClient | Prisma.TransactionClient, friend: { fullName: string; phone: string }, buyerId: string, now = new Date(), firstVisitDeclared = false, excludeOrderId: string | null = null) {
  const phone = normalizeFriendPhone(friend.phone);
  if (!phone) return assessNewFriend(friend, buyerId, []);
  const digits = phone.slice(1);
  const domestic = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const name = normalizedFriendName(friend.fullName);
  // Include inactive/imported identities. Match names too: a changed or shared phone
  // cannot be used to bypass past attendance. Values are bound, never interpolated SQL.
  const candidates = await db.$queryRaw<FriendHistoryCandidate[]>`
    SELECT u.id, u.name, p.phone,
      (EXISTS (SELECT 1 FROM "AttendanceRecord" a WHERE a."userId" = u.id AND a.status IN ('ATTENDED', 'CHECKED_IN'))
        OR EXISTS (SELECT 1 FROM "Booking" b WHERE b."userId" = u.id AND b.status = 'ATTENDED')) AS attended,
      EXISTS (SELECT 1 FROM "Booking" b JOIN "ClassOccurrence" o ON o.id = b."occurrenceId"
        WHERE b."userId" = u.id AND b.status = 'CONFIRMED' AND o."startAt" < ${now}) AS "unresolvedPastBooking",
      COALESCE(s."totalWorkouts", 0) AS "importedWorkouts", s."lastWorkoutAt" AS "importedLastWorkoutAt"
    FROM "User" u
    LEFT JOIN "MemberProfile" p ON p."userId" = u.id
    LEFT JOIN "SombleClientProfile" s ON s."userId" = u.id
    WHERE regexp_replace(COALESCE(p.phone, ''), '[^0-9]', '', 'g') IN (${digits}, ${domestic})
      OR lower(regexp_replace(trim(normalize(COALESCE(u.name, ''), NFKC)), '\\s+', ' ', 'g')) = ${name}
  `;
  const priorGuests = await db.$queryRaw<{exact:boolean}[]>`
    SELECT bool_or("guestPhone"=${phone} AND lower(regexp_replace(trim(normalize("guestName", NFKC)), '\\s+', ' ', 'g'))=${name}) AS exact
    FROM "BlackFridayTicket" WHERE "guestCheckedInAt" IS NOT NULL AND "guestBookingId" IS NULL
    AND state NOT IN ('REFUNDED','DISPUTE_LOST') AND "orderId" IS DISTINCT FROM ${excludeOrderId}
    AND ("guestPhone"=${phone} OR lower(regexp_replace(trim(normalize("guestName", NFKC)), '\\s+', ' ', 'g'))=${name})
    HAVING count(*)>0`;
  if (priorGuests.length) return priorGuests[0].exact
    ? {status:'INELIGIBLE' as const,reason:'PRIOR_ATTENDANCE'}
    : {status:'REVIEW_REQUIRED' as const,reason:'AMBIGUOUS_IDENTITY'};
  return assessNewFriend(friend, buyerId, candidates, firstVisitDeclared);
}
