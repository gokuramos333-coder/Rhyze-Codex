import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';

// All live lead-profile/outreach writers must enter here before reading anything.
// READ COMMITTED gives the callback a fresh snapshot AFTER a lock wait; retaining
// SERIALIZABLE would still create cross-lead index-page predicate conflicts.
// The lock exists even before lazy profile creation. Hash collisions only cause
// extra serialization, never concurrent access to the same lead. Transaction
// scope releases the lock on commit/rollback, including bounded deadlock retries.
export function leadTransaction<T>(
  userId: string,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return retrySerializableTransaction(() => prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`newsletter-lead:${userId}`}, 0))`;
    return write(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted }));
}
