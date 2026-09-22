import {
  Prisma,
  type PrismaClient,
  type MembershipPlanChange,
} from '@prisma/client';
import type Stripe from 'stripe';
import {
  changeEffectiveAt,
  immediateChangeParams,
  scheduledChangeParams,
  validatePlanChangeProduct,
} from '@/lib/domain/memberships/plan-change-policy';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import {
  UncertainBillingChangeError,
  withMembershipBillingLock,
} from '@/lib/domain/memberships/billing-lock';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';

export type PlanChangeInput = {
  userId: string;
  membershipId: string;
  productId: string;
  timing: string;
  date: string;
  actorId: string;
};
const include = {
  product: true,
  user: true,
  purchase: { include: { creditAccount: true } },
  freezes: { where: { cancelledAt: null, resumedAt: null } },
  planChanges: { where: { activeMembershipId: { not: null } } },
} satisfies Prisma.MembershipInclude;
const json = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value));
const id = (value: string | { id: string } | null | undefined) =>
  typeof value === 'string' ? value : value?.id;

function verifyPrice(price: Stripe.Price, cents: number) {
  if (
    !price.active ||
    price.currency !== 'usd' ||
    price.unit_amount !== cents ||
    price.recurring?.interval !== 'month' ||
    price.recurring.interval_count !== 1 ||
    price.recurring.usage_type !== 'licensed'
  ) {
    throw Error(
      'Stripe pricing does not match this monthly membership. Correct the catalog before changing plans.',
    );
  }
}

async function verifiedSource(
  db: PrismaClient,
  stripe: Stripe,
  input: PlanChangeInput,
  now: Date,
) {
  const member = await db.membership.findFirst({
    where: { id: input.membershipId, userId: input.userId },
    include,
  });
  if (
    !member ||
    member.user.status !== 'ACTIVE' ||
    member.status !== 'ACTIVE' ||
    !member.stripeSubscriptionId ||
    !member.purchaseId ||
    !member.currentPeriodEnd ||
    member.currentPeriodEnd <= now ||
    member.product.billingInterval !== 'MONTHLY' ||
    member.cancelAtPeriodEnd ||
    member.freezes.length ||
    member.planChanges.length ||
    !member.purchase?.paidAt ||
    !['PAID', 'PARTIALLY_REFUNDED'].includes(member.purchase.status) ||
    !member.purchase.creditAccount?.validUntil ||
    member.purchase.creditAccount.validUntil < member.currentPeriodEnd
  ) {
    throw Error(
      'This change needs a current paid Stripe membership with no pending change, cancellation or freeze. Manual/imported plans must complete billing setup first.',
    );
  }
  const product = await db.product.findUnique({
    where: { id: input.productId },
  });
  if (!product) throw Error('Membership not found.');
  validatePlanChangeProduct(product, member.productId);
  const subscription = await stripe.subscriptions.retrieve(
    member.stripeSubscriptionId,
    { expand: ['latest_invoice'] },
  );
  if (id(subscription.customer) !== member.user.stripeCustomerId)
    throw Error('Stripe customer does not match this client.');
  if (
    subscription.status !== 'active' ||
    subscription.cancel_at_period_end ||
    subscription.cancel_at ||
    subscription.pause_collection ||
    subscription.pending_update ||
    subscription.schedule ||
    subscription.collection_method !== 'charge_automatically' ||
    subscription.items.data.length !== 1
  ) {
    throw Error(
      'Stripe has a pending change, unpaid subscription, cancellation or special schedule. Resolve it before changing this membership.',
    );
  }
  const item = subscription.items.data[0];
  const latest = subscription.latest_invoice;
  if (
    !latest ||
    typeof latest === 'string' ||
    latest.status !== 'paid' ||
    item.quantity !== 1 ||
    item.price.id !== member.product.stripePriceId ||
    item.current_period_end * 1000 !== member.currentPeriodEnd.getTime() ||
    item.current_period_start >= item.current_period_end
  ) {
    throw Error(
      'Stripe paid period or price differs from Rhyze. Reconcile billing before changing plans.',
    );
  }
  // These configurations need a dedicated quote/preservation workflow, never silently drop them.
  if (
    subscription.discounts.length ||
    item.discounts.length ||
    subscription.default_tax_rates?.length ||
    item.tax_rates?.length ||
    subscription.automatic_tax?.enabled ||
    subscription.billing_thresholds ||
    subscription.transfer_data ||
    subscription.application_fee_percent ||
    (subscription.trial_end &&
      subscription.trial_end > Math.floor(now.getTime() / 1000))
  ) {
    throw Error(
      'This subscription has special discounts, taxes or billing settings. Review its change directly in Stripe.',
    );
  }
  verifyPrice(item.price, member.product.priceCents);
  const price = await stripe.prices.retrieve(product.stripePriceId!);
  verifyPrice(price, product.priceCents);
  return { member, product, subscription, item };
}

async function preview(
  stripe: Stripe,
  subscriptionId: string,
  itemId: string,
  priceId: string,
  effectiveAt: Date,
  periodEnd: Date,
) {
  const renewal = effectiveAt.getTime() === periodEnd.getTime();
  const invoice = await stripe.invoices.createPreview({
    subscription: subscriptionId,
    subscription_details: {
      items: [{ id: itemId, price: priceId, quantity: 1 }],
      billing_cycle_anchor: 'unchanged',
      proration_behavior: renewal ? 'none' : 'always_invoice',
      ...(!renewal
        ? { proration_date: Math.floor(effectiveAt.getTime() / 1000) }
        : {}),
    },
  });
  if (invoice.currency !== 'usd')
    throw Error('Only USD membership changes are supported.');
  return {
    chargeCents: invoice.amount_due,
    creditCents: Math.max(0, -invoice.total),
    totalCents: invoice.total,
  };
}

export async function quoteAdminPlanChange(
  db: PrismaClient,
  stripe: Stripe,
  input: PlanChangeInput,
  now = new Date(),
) {
  const { member, product, subscription, item } = await verifiedSource(
    db,
    stripe,
    input,
    now,
  );
  const effectiveAt = changeEffectiveAt(
    input.timing,
    input.date,
    now,
    member.currentPeriodEnd!,
  );
  const amounts = await preview(
    stripe,
    subscription.id,
    item.id,
    product.stripePriceId!,
    effectiveAt,
    member.currentPeriodEnd!,
  );
  return db.membershipPlanChange.create({
    data: {
      membershipId: member.id,
      fromProductId: member.productId,
      toProductId: product.id,
      actorId: input.actorId,
      timing: input.timing,
      effectiveAt,
      periodStart: new Date(item.current_period_start * 1000),
      periodEnd: member.currentPeriodEnd!,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: id(subscription.customer)!,
      stripeItemId: item.id,
      fromPriceId: item.price.id,
      toPriceId: product.stripePriceId!,
      quote: {
        ...amounts,
        monthlyCents: product.priceCents,
        fromName: member.product.name,
        toName: product.name,
        date: input.date,
      },
    },
  });
}

export async function confirmAdminPlanChange(
  db: PrismaClient,
  stripe: Stripe,
  input: { quoteId: string; userId: string; actorId: string },
  now = new Date(),
) {
  const target = await db.membershipPlanChange.findFirst({
    where: {
      id: input.quoteId,
      actorId: input.actorId,
      membership: { userId: input.userId },
    },
    select: { membershipId: true },
  });
  if (!target) throw Error('Membership change quote not found.');
  return withMembershipBillingLock(
    db,
    target.membershipId,
    () => confirmLockedPlanChange(db, stripe, input, now),
    { key: `plan-change:${input.quoteId}` },
  );
}

async function confirmLockedPlanChange(
  db: PrismaClient,
  stripe: Stripe,
  input: { quoteId: string; userId: string; actorId: string },
  now: Date,
) {
  const operation = await db.membershipPlanChange.findFirst({
    where: {
      id: input.quoteId,
      actorId: input.actorId,
      membership: { userId: input.userId },
    },
  });
  if (!operation) throw Error('Membership change quote not found.');
  if (operation.status !== 'QUOTED') return operation;
  if (
    operation.expiresAt <= now ||
    (operation.timing !== 'NOW' && operation.effectiveAt <= now)
  )
    throw Error('This quote expired. Review a new quote before confirming.');
  const quote = operation.quote as Record<string, string | number>;
  const source = await verifiedSource(
    db,
    stripe,
    {
      userId: input.userId,
      membershipId: operation.membershipId,
      productId: operation.toProductId,
      actorId: input.actorId,
      timing: operation.timing,
      date: String(quote.date || ''),
    },
    now,
  );
  if (
    source.member.productId !== operation.fromProductId ||
    source.item.id !== operation.stripeItemId ||
    source.subscription.id !== operation.stripeSubscriptionId ||
    source.member.currentPeriodEnd!.getTime() !==
      operation.periodEnd.getTime() ||
    source.product.stripePriceId !== operation.toPriceId
  )
    throw Error('Membership changed since this quote. Review it again.');
  const amounts = await preview(
    stripe,
    operation.stripeSubscriptionId,
    operation.stripeItemId,
    operation.toPriceId,
    operation.effectiveAt,
    operation.periodEnd,
  );
  if (
    amounts.chargeCents !== quote.chargeCents ||
    amounts.totalCents !== quote.totalCents ||
    source.product.priceCents !== quote.monthlyCents
  )
    throw Error('The Stripe quote amount changed. Review a new quote.');
  const claimed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE id = ${operation.membershipId} FOR UPDATE`;
    const fresh = await tx.membership.findUniqueOrThrow({
      where: { id: operation.membershipId },
      include,
    });
    const current = await tx.membershipPlanChange.findUniqueOrThrow({
      where: { id: operation.id },
    });
    if (current.status !== 'QUOTED') return false;
    if (
      fresh.status !== 'ACTIVE' ||
      fresh.cancelAtPeriodEnd ||
      fresh.freezes.length ||
      fresh.planChanges.length ||
      fresh.updatedAt.getTime() !== source.member.updatedAt.getTime()
    )
      throw Error('Membership changed while reviewing. Refresh and try again.');
    await tx.membershipPlanChange.update({
      where: { id: operation.id },
      data: {
        status: 'SUBMITTING',
        activeMembershipId: operation.membershipId,
        submittedAt: now,
      },
    });
    if (!fresh.planChangeState) {
      const acceptance = fresh.purchase?.policyAcceptance as Record<
        string,
        unknown
      > | null;
      const prior = acceptance?.nativeVipEntitlement as
        | Record<string, number>
        | undefined;
      await tx.membership.update({
        where: { id: fresh.id },
        data: {
          planChangeState: {
            paidStart: Math.floor(operation.periodStart.getTime() / 1000),
            paidEnd: Math.floor(fresh.currentPeriodEnd!.getTime() / 1000),
            paidAt: Math.max(
              prior?.paidAt || 0,
              Number(acceptance?.lastPaidAt || 0),
              typeof source.subscription.latest_invoice === 'object'
                ? source.subscription.latest_invoice?.status_transitions
                    .paid_at || 0
                : 0,
              Math.floor(operation.periodStart.getTime() / 1000),
              Math.floor(
                (fresh.purchase?.paidAt || fresh.currentPeriodStart).getTime() /
                  1000,
              ),
            ),
            lifecycleAt: Math.max(
              prior?.lifecycleAt || 0,
              Number(acceptance?.lastLifecycleEventAt || 0),
            ),
            restrictiveAt: Math.max(
              prior?.restrictiveAt || 0,
              Number(acceptance?.lastRestrictiveEventAt || 0),
            ),
            fundingInvoiceIds: [id(source.subscription.latest_invoice)!],
            fundingPaymentIntentIds:
              fresh.purchase?.stripePaymentIntentId &&
              fresh.purchase.paidAt &&
              fresh.purchase.paidAt >= operation.periodStart &&
              fresh.purchase.paidAt < operation.periodEnd
                ? [fresh.purchase.stripePaymentIntentId]
                : [],
          },
        },
      });
      // Freeze old labels before the current membership product can change.
      await tx.paymentRecord.updateMany({
        where: { membershipId: fresh.id, productName: null },
        data: { productName: fresh.product.name },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: 'MEMBERSHIP_PLAN_CHANGE_REQUESTED',
        entityType: 'Membership',
        entityId: fresh.id,
        after: json({
          operationId: operation.id,
          fromProductId: operation.fromProductId,
          toProductId: operation.toProductId,
          effectiveAt: operation.effectiveAt,
          renewal: operation.periodEnd,
          quote,
        }),
      },
    });
    return true;
  });
  if (!claimed)
    return db.membershipPlanChange.findUniqueOrThrow({
      where: { id: operation.id },
    });
  return executeSavedChange(db, stripe, operation, now);
}

async function executeSavedChange(
  db: PrismaClient,
  stripe: Stripe,
  operation: MembershipPlanChange,
  now: Date,
) {
  try {
    if (operation.timing === 'NOW') {
      const result = await stripe.subscriptions.update(
        operation.stripeSubscriptionId,
        immediateChangeParams(
          operation.stripeItemId,
          operation.toPriceId,
          Math.floor(operation.effectiveAt.getTime() / 1000),
        ),
        { idempotencyKey: `plan-change:${operation.id}:apply` },
      );
      const invoiceId = id(result.latest_invoice);
      await db.membershipPlanChange.updateMany({
        where: {
          id: operation.id,
          status: { in: ['SUBMITTING', 'AWAITING_PAYMENT'] },
        },
        data: {
          status: 'AWAITING_PAYMENT',
          stripeInvoiceId: invoiceId,
          lastError: null,
        },
      });
      if (invoiceId) {
        const invoice = await stripe.invoices.retrieve(invoiceId, {
          expand: ['payments.data.payment'],
        });
        if (invoice.status === 'paid')
          await retrySerializableTransaction(() =>
            db.$transaction(
              (tx) =>
                processStripeEvent(tx, {
                  id: `plan-change-confirm:${operation.id}:${invoiceId}`,
                  object: 'event',
                  api_version: null,
                  livemode: invoice.livemode,
                  pending_webhooks: 0,
                  request: null,
                  type: 'invoice.paid',
                  created: Math.floor(now.getTime() / 1000),
                  data: { object: invoice },
                } as Stripe.Event),
              { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
            ),
          );
      }
    } else {
      const schedule = await stripe.subscriptionSchedules.create(
        { from_subscription: operation.stripeSubscriptionId },
        { idempotencyKey: `plan-change:${operation.id}:schedule` },
      );
      await db.membershipPlanChange.update({
        where: { id: operation.id },
        data: { stripeScheduleId: schedule.id },
      });
      await stripe.subscriptionSchedules.update(
        schedule.id,
        scheduledChangeParams({
          start: Math.floor(operation.periodStart.getTime() / 1000),
          effective: Math.floor(operation.effectiveAt.getTime() / 1000),
          oldPriceId: operation.fromPriceId,
          newPriceId: operation.toPriceId,
          operationId: operation.id,
        }),
        { idempotencyKey: `plan-change:${operation.id}:phases` },
      );
      await db.membershipPlanChange.updateMany({
        where: { id: operation.id, status: 'SUBMITTING' },
        data: { status: 'SCHEDULED', lastError: null },
      });
    }
  } catch (error) {
    // An uncertain write must retain its operation/lock, never encourage another charge.
    await db.membershipPlanChange.updateMany({
      where: { id: operation.id, status: { not: 'APPLIED' } },
      data: {
        lastError:
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'Stripe confirmation needs review.',
      },
    });
    throw new UncertainBillingChangeError(
      'Stripe confirmation needs review. The change is saved; do not create a duplicate. Check its Stripe subscription before retrying.',
    );
  }
  return db.membershipPlanChange.findUniqueOrThrow({
    where: { id: operation.id },
  });
}

/** Explicit recovery only: retry the exact same Stripe command/key within its
 * retention window. Never produce a second operation after an uncertain write.
 */
export async function reconcileAdminPlanChange(
  db: PrismaClient,
  stripe: Stripe,
  input: { quoteId: string; userId: string; actorId: string },
  now = new Date(),
) {
  const found = await db.membershipPlanChange.findFirst({
    where: { id: input.quoteId, membership: { userId: input.userId } },
    select: { membershipId: true },
  });
  if (!found) throw Error('Saved membership change not found.');
  return withMembershipBillingLock(
    db,
    found.membershipId,
    async () => {
      const operation = await db.membershipPlanChange.findUniqueOrThrow({
        where: { id: input.quoteId },
        include: { membership: true },
      });
      if (
        ['APPLIED', 'SCHEDULED', 'CANCELLED'].includes(operation.status) &&
        !operation.lastError
      )
        return operation;
      if (
        !operation.submittedAt ||
        now.getTime() - operation.submittedAt.getTime() >= 23 * 3600_000
      )
        throw Error(
          'Automatic retry window expired. A manual Stripe reconciliation is required; no new charge was attempted.',
        );
      if (
        !['SUBMITTING', 'AWAITING_PAYMENT'].includes(operation.status) ||
        !operation.activeMembershipId ||
        operation.membership.status !== 'ACTIVE'
      )
        throw Error('This saved change requires manual billing review.');
      if (operation.lastError?.includes('refunded or disputed'))
        throw Error(
          'Refunded or disputed payments require manual review; no retry was attempted.',
        );
      const subscription = await stripe.subscriptions.retrieve(
        operation.stripeSubscriptionId,
        { expand: ['latest_invoice'] },
      );
      if (
        id(subscription.customer) !== operation.stripeCustomerId ||
        subscription.cancel_at_period_end ||
        subscription.pause_collection ||
        !['active', 'past_due'].includes(subscription.status)
      )
        throw Error('Stripe billing changed; manual review is required.');
      await db.auditLog.create({
        data: {
          actorId: input.actorId,
          action: 'MEMBERSHIP_PLAN_CHANGE_RECONCILE',
          entityType: 'Membership',
          entityId: operation.membershipId,
          after: { operationId: operation.id },
        },
      });
      return executeSavedChange(db, stripe, operation, now);
    },
    { key: `plan-change:${input.quoteId}`, recover: true },
  );
}
