import type { Prisma, PrismaClient } from '@prisma/client';
import type { OwnerAccessInput } from './owner-access';

/** Cash approval is restricted to the two existing studio owners, not general admin access. */
export function isFinancialApprover(actor: OwnerAccessInput): boolean {
  return actor.role === 'OWNER' && actor.status === 'ACTIVE' &&
    ['vanessa@rhyzefit.com', 'melissa@rhyzefit.com'].includes(actor.email.trim().toLowerCase());
}
export async function assertFinancialApprover(db: Pick<PrismaClient | Prisma.TransactionClient, 'user'>, actorId: string) {
  const actor = await db.user.findUnique({ where: { id: actorId } });
  if (!actor || !isFinancialApprover(actor)) throw Error('Only active owners Vanessa or Melissa can approve a cash refund or replacement fee');
  return actor;
}
