import type { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { randomUUID } from 'node:crypto';

export class UncertainBillingChangeError extends Error {}

/** Durable ownership has no expiring transaction lease. A process crash or
 * uncertain Stripe write stays blocked until that same operation is reconciled.
 */
export async function withMembershipBillingLock<T>(
  db: PrismaClient,
  membershipId: string,
  run: () => Promise<T>,
  options: { key?: string; recover?: boolean } = {},
) {
  const token = options.key || randomUUID();
  const claimed = await db.membership.updateMany({
    where: {
      id: membershipId,
      OR: [
        { billingLockToken: null },
        ...(options.recover
          ? [{ billingLockToken: token, billingLockNeedsReview: true }]
          : []),
      ],
    },
    data: { billingLockToken: token, billingLockNeedsReview: false },
  });
  if (!claimed.count)
    throw Error(
      'A billing action is already in progress or needs review. Resolve that saved action first.',
    );
  try {
    const result = await run();
    await db.membership.updateMany({
      where: { id: membershipId, billingLockToken: token },
      data: { billingLockToken: null, billingLockNeedsReview: false },
    });
    return result;
  } catch (error) {
    await db.membership.updateMany({
      where: { id: membershipId, billingLockToken: token },
      data:
        error instanceof UncertainBillingChangeError
          ? { billingLockNeedsReview: true }
          : { billingLockToken: null, billingLockNeedsReview: false },
    });
    throw error;
  }
}

export async function updateMembershipStripeBilling(
  stripe: Stripe,
  subscriptionId: string,
  input: Stripe.SubscriptionUpdateParams,
  options: Stripe.RequestOptions,
) {
  try {
    return await stripe.subscriptions.update(subscriptionId, input, {
      ...options,
      timeout: 5000,
      maxNetworkRetries: 0,
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      [
        'StripeInvalidRequestError',
        'StripeCardError',
        'StripeAuthenticationError',
        'StripePermissionError',
      ].includes(String(error.type))
    )
      throw error;
    throw new UncertainBillingChangeError(
      'Stripe billing confirmation is uncertain. Review Stripe before another billing action.',
    );
  }
}

export async function assertNoPendingPlanChange(
  db: PrismaClient,
  membershipId: string,
) {
  if (
    await db.membershipPlanChange.findUnique({
      where: { activeMembershipId: membershipId },
      select: { id: true },
    })
  ) {
    throw Error(
      'A membership change is already in progress. Review it before pausing, freezing or cancelling billing.',
    );
  }
}
