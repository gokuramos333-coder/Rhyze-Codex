import type { Prisma } from '@prisma/client';

/** Resolve a legacy import without treating purchase/activation dates as ownership. */
export async function findSombleMembershipForImport(
  tx: Prisma.TransactionClient,
  input: { userId: string; productId: string; purchasedAt: Date },
) {
  // Native trials move currentPeriodStart on activation. Check every membership
  // for this member/product before selecting an import or creating a replacement.
  const memberships = await tx.membership.findMany({
    where: { userId: input.userId, productId: input.productId },
    select: { id: true, purchaseId: true, stripeSubscriptionId: true, currentPeriodStart: true },
  });
  if (memberships.some(item => item.purchaseId || item.stripeSubscriptionId)) {
    throw new Error('Native membership overlap needs review before Somble import.');
  }
  // Without a durable import ID, multiple rows or a different start are
  // ambiguous. Do not pick the first row or mint a second entitlement.
  if (memberships.length > 1 || (memberships[0] &&
    memberships[0].currentPeriodStart.getTime() !== input.purchasedAt.getTime())) {
    throw new Error('Ambiguous membership ownership needs review before Somble import.');
  }
  return memberships[0] ?? null;
}
