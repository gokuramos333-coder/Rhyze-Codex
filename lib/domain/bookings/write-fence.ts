import type { Prisma } from '@prisma/client';

/**
 * Advisory locks order cooperating writers but do not refresh an older MVCC
 * snapshot. A real no-op row UPDATE additionally makes a stale SERIALIZABLE
 * writer fail (40001), so its caller retries the entire transaction. Do not
 * replace this with SELECT FOR UPDATE: the row version must change even when
 * only a child booking/refund/credit ledger is subsequently written.
 * Raw UPDATE deliberately preserves all business fields and updatedAt.
 * Order: occurrence -> order -> booking; never acquire a parent after a child.
 */
export async function lockOccurrenceWrites(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
  await tx.$executeRaw`UPDATE "ClassOccurrence" SET "id" = "id" WHERE "id" = ${id}`;
}

export async function lockOrderWrites(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
  await tx.$executeRaw`UPDATE "CommerceOrder" SET "id" = "id" WHERE "id" = ${id}`;
}

export async function lockBookingWrites(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
  await tx.$executeRaw`UPDATE "Booking" SET "id" = "id" WHERE "id" = ${id}`;
}
