import type { Prisma } from '@prisma/client';

/** All new bookings and managed-plan fulfillment share this transaction lock. */
export async function lockMembershipEntitlements(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'membership-entitlement:' + userId}, 0))`;
  // Also advance a shared MVCC row version. A SERIALIZABLE reader that took its
  // snapshot before waiting must retry rather than use pre-booking credit data.
  // No user attributes (including updatedAt) change.
  await tx.$executeRaw`UPDATE "User" SET id = id WHERE id = ${userId}`;
}
