import type { Prisma } from '@prisma/client';

/** Correct benefits on an existing documented gift; never create or extend access. */
export async function correctManualAssignmentToClasses(
  tx: Prisma.TransactionClient,
  input: { actorId: string; userId: string; membershipId: string; productId: string; reason: string },
  now = new Date(),
) {
  const reason = input.reason.trim();
  if (!input.actorId || !input.userId || !input.membershipId || !input.productId || reason.length < 5 || reason.length > 240)
    throw Error('Choose the class-only plan and enter a correction reason.');

  await tx.$queryRaw`
    SELECT m.id FROM "Membership" m
    JOIN "Purchase" p ON p.id = m."purchaseId"
    JOIN "CreditAccount" c ON c."sourcePurchaseId" = p.id
    WHERE m.id = ${input.membershipId} AND m."userId" = ${input.userId}
    FOR UPDATE OF m, p, c
  `;
  const membership = await tx.membership.findFirst({
    where: { id: input.membershipId, userId: input.userId },
    include: {
      user: { select: { status: true } },
      purchase: { include: { creditAccount: true } },
      freezes: { where: { cancelledAt: null, resumedAt: null } },
      planChanges: { where: { activeMembershipId: { not: null } } },
    },
  });
  const purchase = membership?.purchase;
  const account = purchase?.creditAccount;
  const assignment = purchase?.policyAcceptance as { source?: string; actorId?: string; accessEndsAt?: string } | null;
  const end = membership?.currentPeriodEnd;
  if (!membership || membership.user.status !== 'ACTIVE' || membership.status !== 'ACTIVE' ||
      membership.stripeSubscriptionId || membership.cancelAtPeriodEnd || membership.billingLockToken || membership.billingLockNeedsReview ||
      membership.planChangeState || membership.freezes.length || membership.planChanges.length ||
      !purchase || purchase.userId !== input.userId || purchase.status !== 'PAID' || purchase.amountCents !== 0 ||
      purchase.refundedAmountCents !== 0 || !purchase.paidAt || purchase.stripePaymentIntentId || purchase.stripeCheckoutSessionId ||
      assignment?.source !== 'ADMIN_ASSIGNMENT' || !assignment.actorId || !end || end <= now || assignment.accessEndsAt !== end.toISOString() ||
      !account || account.userId !== input.userId || !account.isUnlimited || account.validFrom > now ||
      account.validUntil?.getTime() !== end.getTime()) {
    throw Error('Only a current, documented no-charge unlimited assignment with matching access dates can be corrected.');
  }
  const product = await tx.product.findUnique({ where: { id: input.productId } });
  if (!product || !product.isActive || product.isPublic || !product.isUnlimited || product.priceCents !== 0 || product.stripePriceId ||
      product.billingInterval !== 'ONE_TIME' || product.kind !== 'MONTHLY_UNLIMITED' || product.customPlanType !== 'COMPLIMENTARY_STANDARD')
    throw Error('Choose an existing private complimentary standard-class plan.');
  if (membership.productId === product.id) return;

  const window = {
    userId: input.userId, purchaseId: purchase.id, creditAccountId: account.id,
    currentPeriodStart: membership.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: end.toISOString(), validFrom: account.validFrom.toISOString(), validUntil: account.validUntil!.toISOString(),
  };
  const before = { ...window, productId: membership.productId, label: account.label };
  await tx.membership.update({ where: { id: membership.id }, data: { productId: product.id } });
  const label = `${product.name} — admin assigned`;
  await tx.creditAccount.update({ where: { id: account.id }, data: { label } });
  await tx.auditLog.create({ data: {
    actorId: input.actorId, action: 'admin.membership-assignment-corrected', entityType: 'Membership', entityId: membership.id,
    before,
    after: { ...window, productId: product.id, label, reason },
  } });
}
