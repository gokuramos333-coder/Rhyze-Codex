import type { PrismaClient } from '@prisma/client';
export async function syncAccountContacts(
  client: PrismaClient,
  update: (
    customerId: string,
    contact: { email: string; name: string },
  ) => Promise<void>,
  now = new Date(),
) {
  const due = await client.accountContactSync.findMany({
    where: { nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: 'asc' },
    take: 2,
  });
  const result = { succeeded: 0, failed: 0 };
  for (const item of due) {
    const outcome = await client.$transaction(
      async (tx) => {
        // Match the identity writer's lock order. Reading the current user under
        // this lock prevents a delayed job from replacing newer contact details.
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${item.userId} FOR UPDATE`;
        const pending = await tx.accountContactSync.findUnique({
          where: { userId: item.userId },
        });
        if (!pending || pending.nextAttemptAt > now) return null;
        const user = await tx.user.findUnique({
          where: { id: item.userId },
          select: { email: true, name: true, stripeCustomerId: true },
        });
        if (user?.stripeCustomerId) {
          try {
            // Only mutable customer contact fields: never historical invoices,
            // receipts, subscription IDs, prices, or payment methods.
            await update(user.stripeCustomerId, {
              email: user.email,
              name: user.name || '',
            });
          } catch {
            const delay = Math.min(
              24 * 60 * 60_000,
              60_000 * 2 ** Math.min(pending.attempts + 1, 11),
            );
            await tx.accountContactSync.update({
              where: { userId: item.userId },
              data: {
                attempts: { increment: 1 },
                nextAttemptAt: new Date(now.getTime() + delay),
                lastError: 'Contact synchronization failed; retry pending.',
              },
            });
            return 'failed' as const;
          }
        }
        await tx.accountContactSync.delete({ where: { userId: item.userId } });
        return 'succeeded' as const;
      },
      { maxWait: 500, timeout: 4000 },
    );
    if (outcome) result[outcome] += 1;
  }
  return result;
}
