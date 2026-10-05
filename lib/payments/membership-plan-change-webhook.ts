import { grantVipEventCredit } from '@/lib/domain/credits/grant-vip-event-credit';
import { vipMonthlyBenefitWindowForDate } from '@/lib/domain/credits/vip-monthly-benefits';
import type { Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { planChangeCreditAdjustment } from '@/lib/domain/memberships/plan-change-policy';
import { queueEmail } from '@/lib/notifications/email-queue';
import { lockMembershipEntitlements } from '@/lib/domain/credits/entitlement-lock';

type ObjectData = Record<string, any>;
type PaidPlanState = {
  paidStart: number;
  paidEnd: number;
  paidAt: number;
  lifecycleAt?: number;
  restrictiveAt?: number;
  lastInvoiceId?: string;
  fundingInvoiceIds?: string[];
  fundingPaymentIntentIds?: string[];
  fundingReversedAt?: number;
};
const identifier = (value: unknown): string | null =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && 'id' in value
      ? String(value.id)
      : null;
const linePrice = (line: ObjectData) =>
  identifier(line.price) || identifier(line.pricing?.price_details?.price);
const isProration = (line: ObjectData) =>
  Boolean(line.proration || line.parent?.subscription_item_details?.proration);

/** Managed changes own paid periods permanently, including migrated subscriptions.
 * Original purchase receipts/payment IDs are immutable; adjustments are separate records.
 */
export async function processMembershipPlanChangeEvent(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
) {
  if (['charge.refunded', 'charge.dispute.created'].includes(event.type)) {
    const charge = event.data.object as unknown as ObjectData;
    const intent = identifier(charge.payment_intent);
    if (!intent || (event.type === 'charge.refunded' && !charge.refunded))
      return false;
    const payment = await tx.paymentRecord.findUnique({
      where: { stripePaymentIntentId: intent },
    });
    if (!payment?.membershipId) return false;
    const initial = await tx.membership.findUnique({
      where: { id: payment.membershipId },
    });
    if (!initial?.planChangeState) return false;
    await lockMembershipEntitlements(tx, initial.userId);
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE id = ${initial.id} FOR UPDATE`;
    const current = await tx.membership.findUniqueOrThrow({
      where: { id: initial.id },
    });
    const state = current.planChangeState as PaidPlanState;
    // Historical receipts remain independent of a newer, separately paid period.
    if (
      (payment.stripeInvoiceId &&
        (state.fundingInvoiceIds || [state.lastInvoiceId]).includes(
          payment.stripeInvoiceId,
        )) ||
      (state.fundingPaymentIntentIds || []).includes(intent)
    ) {
      await tx.membership.update({
        where: { id: current.id },
        data: {
          ...(['ACTIVE', 'TRIALING'].includes(current.status)
            ? { status: 'PAST_DUE' }
            : {}),
          planChangeState: {
            ...state,
            restrictiveAt: Math.max(
              Number(state.restrictiveAt || 0),
              event.created,
            ),
            fundingReversedAt: event.created,
          } as Prisma.InputJsonValue,
        },
      });
      if (current.purchaseId)
        await tx.creditAccount.updateMany({
          where: {
            sourcePurchaseId: current.purchaseId,
            OR: [
              { validUntil: null },
              { validUntil: { gt: new Date(event.created * 1000) } },
            ],
          },
          data: { validUntil: new Date(event.created * 1000) },
        });
    }
    // Continue through the existing financial/refund ledger handler.
    return false;
  }
  const invoiceEvent = ['invoice.paid', 'invoice.payment_failed'].includes(
    event.type,
  );
  const subscriptionEvent = event.type.startsWith('customer.subscription.');
  if (!invoiceEvent && !subscriptionEvent) return false;
  const object = event.data.object as unknown as ObjectData;
  const subscriptionId = subscriptionEvent
    ? String(object.id)
    : identifier(object.subscription) ||
      identifier(object.parent?.subscription_details?.subscription);
  if (!subscriptionId) return false;
  const initial = await tx.membership.findUnique({
    where: { stripeSubscriptionId: subscriptionId },
  });
  if (!initial?.planChangeState) return false;
  await lockMembershipEntitlements(tx, initial.userId);
  await tx.$queryRaw`SELECT id FROM "Membership" WHERE id = ${initial.id} FOR UPDATE`;
  const membership = await tx.membership.findUniqueOrThrow({
    where: { id: initial.id },
    include: {
      user: true,
      product: true,
      purchase: { include: { creditAccount: { include: { entries: true } } } },
      planChanges: {
        include: { fromProduct: true, toProduct: true },
        orderBy: { effectiveAt: 'desc' },
      },
    },
  });
  const state = membership.planChangeState as PaidPlanState;
  if (identifier(object.customer) !== membership.user.stripeCustomerId)
    throw Error('Plan-change event customer mismatch.');
  const saveState = (next: Partial<PaidPlanState>) =>
    tx.membership.update({
      where: { id: membership.id },
      data: { planChangeState: { ...state, ...next } },
    });
  if (subscriptionEvent) {
    if (event.created < Math.max(state.paidAt || 0, state.lifecycleAt || 0))
      return true;
    const restricted =
      object.pause_collection || object.status === 'paused'
        ? 'PAUSED'
        : ['canceled', 'incomplete_expired'].includes(object.status)
          ? 'CANCELLED'
          : ['past_due', 'unpaid', 'incomplete'].includes(object.status) &&
              event.created >= state.paidEnd
            ? 'PAST_DUE'
            : null;
    await tx.membership.update({
      where: { id: membership.id },
      data: {
        cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
        ...(restricted ? { status: restricted } : {}),
      },
    });
    await saveState({
      lifecycleAt: event.created,
      ...(restricted ? { restrictiveAt: event.created } : {}),
    });
    if (
      event.type === 'customer.subscription.pending_update_expired' ||
      restricted === 'CANCELLED'
    ) {
      await tx.membershipPlanChange.updateMany({
        where: { activeMembershipId: membership.id },
        data: {
          status: 'CANCELLED',
          activeMembershipId: null,
          lastError: restricted
            ? 'Subscription cancelled.'
            : 'Payment window expired; original plan retained.',
        },
      });
    }
    return true;
  }
  if (object.currency !== 'usd' || object.lines?.has_more)
    throw Error('Plan-change invoice needs full USD line verification.');
  const lines: ObjectData[] = object.lines?.data || [];
  const adjustment = object.billing_reason === 'subscription_update';
  if (
    !adjustment &&
    !['subscription_cycle', 'subscription_create'].includes(
      object.billing_reason,
    )
  )
    return true;
  const operation =
    membership.planChanges.find(
      (change) => change.stripeInvoiceId === String(object.id),
    ) ||
    membership.planChanges.find(
      (change) =>
        change.submittedAt &&
        change.status !== 'QUOTED' &&
        lines.some(
          (line) =>
            linePrice(line) === change.toPriceId &&
            Number(line.period?.start) >=
              Math.floor(change.effectiveAt.getTime() / 1000) &&
            (!adjustment ||
              isProration(line) ||
              (change.quote as { resetBillingCycle?: boolean })
                ?.resetBillingCycle === true),
        ),
    );
  const resetsCycle =
    adjustment &&
    (operation?.quote as { resetBillingCycle?: boolean } | null)
      ?.resetBillingCycle === true;
  const proratedAdjustment = adjustment && !resetsCycle;
  const candidates = lines.filter((line) =>
    adjustment
      ? operation &&
        linePrice(line) === operation.toPriceId &&
        (resetsCycle ? !isProration(line) : isProration(line))
      : !isProration(line) && linePrice(line),
  );
  if (candidates.length !== 1)
    throw Error('Plan-change invoice price/period is ambiguous.');
  const line = candidates[0];
  const priceId = linePrice(line);
  const matched = membership.planChanges.find(
    (change) => change.toPriceId === priceId || change.fromPriceId === priceId,
  );
  const product =
    matched?.toPriceId === priceId ? matched.toProduct : matched?.fromProduct;
  if (!product)
    throw Error('Invoice price is not an approved membership price.');
  const start = Number(line.period?.start);
  const end = Number(line.period?.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start)
    throw Error('Invalid membership invoice period.');
  const payment = object.payments?.data?.find(
    (entry: ObjectData) => entry.payment?.type === 'payment_intent',
  );
  const intent =
    identifier(payment?.payment?.payment_intent) ||
    identifier(object.payment_intent);
  const invoiceId = String(object.id);
  if (resetsCycle) {
    const quote = operation!.quote as { monthlyCents?: number };
    const expectedAmount = quote.monthlyCents;
    const anchor = new Date(start * 1000);
    const nextMonth = new Date(start * 1000);
    nextMonth.setUTCDate(1);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    const lastDay = new Date(
      Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0),
    ).getUTCDate();
    nextMonth.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
    // Bind to the exact invoice returned by this reviewed update. Early webhooks
    // fail closed and retry after the submitting request persists that binding.
    if (
      !operation!.stripeInvoiceId ||
      operation!.stripeInvoiceId !== invoiceId ||
      !Number.isInteger(expectedAmount) ||
      Number(expectedAmount) <= 0 ||
      object.amount_due !== expectedAmount ||
      object.total !== expectedAmount ||
      (event.type === 'invoice.paid' &&
        object.amount_paid !== expectedAmount) ||
      start < Math.floor(operation!.effectiveAt.getTime() / 1000) ||
      lines.length !== 1 ||
      line.quantity !== 1 ||
      (identifier(line.parent?.subscription_item_details?.subscription_item) ||
        identifier(line.subscription_item)) !== operation!.stripeItemId ||
      end !== nextMonth.getTime() / 1000
    ) {
      throw Error(
        'Full-month reset invoice does not match the approved payment and period.',
      );
    }
  }
  const existing = await tx.paymentRecord.findFirst({
    where: {
      OR: [
        { stripeInvoiceId: invoiceId },
        ...(intent ? [{ stripePaymentIntentId: intent }] : []),
      ],
    },
  });
  // A sync-created payment is not fulfilled yet. Invoice binding is the fulfillment marker.
  if (
    existing?.stripeInvoiceId &&
    ['SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'].includes(
      existing.status,
    )
  )
    return true;
  const paid = event.type === 'invoice.paid';
  const paidAt = Number(object.status_transitions?.paid_at);
  if (
    paid &&
    (object.status !== 'paid' ||
      !Number.isInteger(paidAt) ||
      !(
        object.amount_paid > 0 ||
        (object.amount_paid === 0 && object.amount_due === 0)
      ))
  )
    throw Error('Invoice has no verified paid settlement.');
  const record = {
    userId: membership.userId,
    membershipId: membership.id,
    purchaseId: null,
    kind: 'MEMBERSHIP_RENEWAL' as const,
    status: paid ? ('SUCCEEDED' as const) : ('FAILED' as const),
    amountCents: Number(paid ? object.amount_paid : object.amount_due),
    currency: 'usd',
    productName: `${product.name}${adjustment ? ' — plan adjustment' : ''}`,
    customerName: membership.user.name,
    customerEmail: membership.user.email,
    stripeCustomerId: membership.user.stripeCustomerId,
    stripeInvoiceId: invoiceId,
    stripePaymentIntentId: intent,
    stripeSubscriptionId: subscriptionId,
    occurredAt: new Date((paid ? paidAt : event.created) * 1000),
  };
  if (existing)
    await tx.paymentRecord.update({ where: { id: existing.id }, data: record });
  else
    await tx.paymentRecord.create({
      data: { ...record, stripeEventId: event.id },
    });
  if (
    existing &&
    ['REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'].includes(existing.status)
  ) {
    await tx.paymentRecord.update({
      where: { id: existing.id },
      data: { status: existing.status },
    });
    if (operation?.activeMembershipId)
      await tx.membershipPlanChange.update({
        where: { id: operation.id },
        data: {
          lastError:
            'Payment was refunded or disputed before access activation. Manual billing review required.',
        },
      });
    return true;
  }
  if (!paid) {
    if (
      !adjustment &&
      event.created >= state.paidEnd &&
      !['PAUSED', 'CANCELLED', 'EXPIRED'].includes(membership.status)
    ) {
      await tx.membership.update({
        where: { id: membership.id },
        data: { status: 'PAST_DUE' },
      });
      await saveState({ restrictiveAt: event.created });
    }
    if (operation?.activeMembershipId)
      await tx.membershipPlanChange.update({
        where: { id: operation.id },
        data: { status: 'AWAITING_PAYMENT', stripeInvoiceId: invoiceId },
      });
    await tx.inAppNotification.create({
      data: {
        userId: membership.userId,
        title: 'Membership payment needs attention',
        body: 'Your payment did not complete. New membership access will begin only after payment succeeds.',
        link: '/member/billing',
      },
    });
    return true;
  }
  const account = membership.purchase?.creditAccount;
  if (!account) throw Error('Membership credit account missing.');
  const canApply =
    !['PAUSED', 'CANCELLED', 'EXPIRED'].includes(membership.status) &&
    paidAt >= (state.paidAt || 0) &&
    (adjustment
      ? Boolean(operation?.activeMembershipId) &&
        !state.fundingReversedAt &&
        (resetsCycle
          ? end > state.paidEnd &&
            start >= Math.floor(operation!.effectiveAt.getTime() / 1000)
          : end === state.paidEnd)
      : end > state.paidEnd);
  if (!canApply) return true;
  const balance = account.entries.reduce(
    (sum, entry) => sum + entry.quantity,
    0,
  );
  let quantity: number;
  if (proratedAdjustment) {
    const cycleEntries = account.entries.filter(
      (entry) => entry.createdAt.getTime() >= state.paidStart * 1000,
    );
    const reservedBookings = cycleEntries
      .filter((entry) => entry.type === 'RESERVE' && entry.bookingId)
      .map((entry) => entry.bookingId!);
    const unreservedBookings = await tx.booking.findMany({
      where: {
        userId: membership.userId,
        createdAt: { gte: new Date(state.paidStart * 1000) },
        status: { in: ['CONFIRMED', 'ATTENDED', 'NO_SHOW', 'LATE_CANCELLED'] },
        policySnapshot: { path: ['creditAccountId'], equals: account.id },
        ...(reservedBookings.length ? { id: { notIn: reservedBookings } } : {}),
      },
      select: { id: true },
    });
    const ledgerUsed = -account.entries
      .filter((entry) =>
        entry.bookingId
          ? reservedBookings.includes(entry.bookingId) &&
            ['RESERVE', 'RELEASE', 'RESTORE'].includes(entry.type)
          : entry.type === 'RESERVE' &&
            entry.createdAt.getTime() >= state.paidStart * 1000,
      )
      .reduce((sum, entry) => sum + entry.quantity, 0);
    // A converted unlimited booking now consumes a limited-plan credit. Track
    // that debit per booking so the existing early-cancellation/restore flows
    // can return it once without changing historical fee policy snapshots.
    const converted = product.isUnlimited ? 0 : unreservedBookings.length;
    for (const booking of product.isUnlimited ? [] : unreservedBookings) {
      await tx.creditLedgerEntry.create({
        data: {
          creditAccountId: account.id,
          bookingId: booking.id,
          type: 'RESERVE',
          quantity: -1,
          sourceReturnKey: `plan-change-reserve:${booking.id}`,
          reason:
            'Existing booking counted toward changed membership allowance',
        },
      });
    }
    quantity = planChangeCreditAdjustment(
      balance - converted,
      Math.max(0, ledgerUsed) + unreservedBookings.length,
      product.isUnlimited ? null : product.includedCredits,
    );
  } else
    quantity =
      (product.isUnlimited ? 0 : product.includedCredits || 0) - balance;
  await tx.creditAccount.update({
    where: { id: account.id },
    data: {
      label: product.name,
      isUnlimited: product.isUnlimited,
      validUntil: new Date(end * 1000),
      ...(!proratedAdjustment ? { validFrom: new Date(start * 1000) } : {}),
    },
  });
  await tx.creditLedgerEntry.create({
    data: {
      creditAccountId: account.id,
      sourceStripeInvoiceId: invoiceId,
      type: quantity < 0 ? 'EXPIRE' : 'GRANT',
      quantity,
      reason: proratedAdjustment
        ? 'Paid membership plan adjustment; prior use retained'
        : 'Paid membership renewal',
    },
  });
  await tx.membership.update({
    where: { id: membership.id },
    data: {
      productId: product.id,
      status: 'ACTIVE',
      ...(!proratedAdjustment
        ? {
            currentPeriodStart: new Date(start * 1000),
            currentPeriodEnd: new Date(end * 1000),
          }
        : {}),
    },
  });
  await saveState({
    paidStart: proratedAdjustment ? state.paidStart : start,
    paidEnd: end,
    paidAt,
    lastInvoiceId: invoiceId,
    fundingInvoiceIds: [
      ...(proratedAdjustment ? state.fundingInvoiceIds || [] : []),
      invoiceId,
    ],
    fundingPaymentIntentIds: [
      ...(proratedAdjustment ? state.fundingPaymentIntentIds || [] : []),
      ...(intent ? [intent] : []),
    ],
    fundingReversedAt: 0,
  });
  if (product.kind === 'VIP' && product.isUnlimited)
    await grantVipEventCredit(
      tx,
      membership.userId,
      vipMonthlyBenefitWindowForDate(new Date(paidAt * 1000)),
    );
  if (operation?.activeMembershipId && operation.toProductId === product.id) {
    await tx.membershipPlanChange.update({
      where: { id: operation.id },
      data: {
        status: 'APPLIED',
        activeMembershipId: null,
        appliedAt: new Date(paidAt * 1000),
        stripeInvoiceId: invoiceId,
        lastError: null,
      },
    });
    await tx.membershipChangeRequest.updateMany({
      where: {
        membershipId: membership.id,
        type: 'CHANGE',
        status: 'PENDING',
        requestedProductId: product.id,
      },
      data: {
        status: 'APPROVED',
        reviewedById: operation.actorId,
        reviewedAt: new Date(paidAt * 1000),
        reviewNote: 'Confirmed through the admin Stripe plan-change review.',
      },
    });
  }
  await tx.inAppNotification.create({
    data: {
      userId: membership.userId,
      title: adjustment ? 'Membership updated' : 'Membership renewed',
      body: resetsCycle
        ? `${product.name} is active. Your new paid month renews on ${new Date(end * 1000).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}.`
        : `${product.name} is active. Your renewal date stays on the existing monthly schedule.`,
      link: '/member/membership',
    },
  });
  if (!adjustment)
    await queueEmail(tx, {
      userId: membership.userId,
      to: membership.user.email,
      subject: `${product.name} renewed`,
      template: 'MEMBERSHIP_RENEWED',
      payload: {
        name: membership.user.name || 'Rhyzer',
        planName: product.name,
        amount: record.amountCents,
        nextBillingDate: new Date(end * 1000).toLocaleDateString('en-US'),
        billingUrl: '/member/billing',
      },
      dedupeKey: `membership-renewed:${invoiceId}`,
    });
  return true;
}
