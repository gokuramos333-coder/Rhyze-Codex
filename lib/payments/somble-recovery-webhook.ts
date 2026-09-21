import type Stripe from 'stripe';
import type { Prisma } from '@prisma/client';
import {
  eligibleRecovery,
  RECOVERY_VERSION,
  recoveryCreditConsumption,
  recoveryForUser,
  recoveryPeriod,
  recoveryPurchaseId,
} from '@/lib/domain/memberships/somble-billing-recovery';
import { assertRecoveryProduct } from '@/lib/payments/somble-recovery-checkout';
import { renewalCreditReset } from '@/lib/domain/credits/membership-renewal';

type ObjectData = Record<string, any>;
function id(value: any): string | null {
  return typeof value === 'string' ? value : (value?.id ?? null);
}

/** Called inside the webhook transaction. Recovery invoices, not Checkout/trial events, own paid access. */
export async function processSombleRecoveryEvent(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
): Promise<boolean> {
  const object = event.data.object as unknown as ObjectData;
  const metadata =
    object.parent?.subscription_details?.metadata ??
    object.subscription_details?.metadata ??
    object.metadata ??
    {};
  if (
    metadata.recovery !== RECOVERY_VERSION &&
    !String(metadata.purchaseId ?? '').startsWith(`${RECOVERY_VERSION}:`)
  )
    return false;
  const r = recoveryForUser(metadata.userId);
  if (
    !r ||
    metadata.purchaseId !== recoveryPurchaseId(r) ||
    metadata.membershipId !== r.membershipId ||
    metadata.productId !== r.productId
  )
    throw new Error('Unverified recovery metadata.');
  // Completion must never run the generic membership upsert, even if payment_status says no_payment_required.
  if (event.type.startsWith('checkout.session.')) return true;
  if (
    ![
      'invoice.paid',
      'invoice.payment_failed',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ].includes(event.type)
  )
    return false;
  await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${metadata.purchaseId} FOR UPDATE`;
  const purchase = await tx.purchase.findUnique({
    where: { id: metadata.purchaseId },
    include: { product: true },
  });
  const acceptance = purchase?.policyAcceptance as ObjectData | null;
  const user = await tx.user.findUnique({
    where: { id: r.userId },
    include: { memberships: { include: { product: true } } },
  });
  const membership = user?.memberships.find((m) => m.id === r.membershipId);
  if (
    !purchase ||
    !user ||
    !membership ||
    purchase.userId !== r.userId ||
    purchase.productId !== r.productId ||
    purchase.amountCents !== r.amountCents ||
    purchase.currency !== 'usd' ||
    acceptance?.recovery !== RECOVERY_VERSION ||
    acceptance.membershipId !== r.membershipId ||
    user.email !== r.email ||
    id(object.customer) !== user.stripeCustomerId ||
    id(object.customer) !== acceptance.customerId
  )
    throw new Error('Unverified recovery purchase/customer.');
  assertRecoveryProduct(r, purchase.product);
  const subscriptionId = event.type.startsWith('customer.subscription.')
    ? id(object)
    : (id(object.subscription) ??
      id(object.parent?.subscription_details?.subscription));
  if (
    !subscriptionId ||
    (acceptance.subscriptionId &&
      acceptance.subscriptionId !== subscriptionId) ||
    (membership.stripeSubscriptionId &&
      membership.stripeSubscriptionId !== subscriptionId)
  )
    throw new Error('Recovery subscription mismatch.');
  const lastPaidAt = Number(acceptance.lastPaidAt || 0);
  const lastLifecycleEventAt = Number(acceptance.lastLifecycleEventAt || 0);
  const lastRestrictiveEventAt = Number(acceptance.lastRestrictiveEventAt || 0);

  if (event.type.startsWith('customer.subscription.')) {
    // Periods are set exclusively by successful invoices; trialing is a billing deferral, not free access.
    const status =
      object.status === 'canceled'
        ? 'CANCELLED'
        : ['past_due', 'unpaid', 'incomplete'].includes(object.status)
          ? 'PAST_DUE'
          : object.status === 'paused'
            ? 'PAUSED'
            : null;
    if (
      event.created < Math.max(lastPaidAt, lastLifecycleEventAt) ||
      (status === 'PAST_DUE' && event.created === lastPaidAt)
    )
      return true;
    const item = object.items?.data?.[0];
    const incomingEnd = object.current_period_end ?? item?.current_period_end;
    if (
      typeof incomingEnd === 'number' &&
      membership.currentPeriodEnd &&
      incomingEnd * 1000 < membership.currentPeriodEnd.getTime()
    )
      return true;
    if (membership.purchaseId === purchase.id)
      await tx.membership.update({
        where: { id: membership.id },
        data: {
          ...(status ? { status } : {}),
          cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
        },
      });
    await tx.purchase.update({
      where: { id: purchase.id },
      data: {
        policyAcceptance: {
          ...acceptance,
          subscriptionId,
          lastLifecycleEventAt: event.created,
          ...(status
            ? {
                lastRestrictiveEventAt: event.created,
                lastRestrictiveStatus: status,
              }
            : {}),
        },
      },
    });
    return true;
  }
  if (event.type === 'invoice.payment_failed') {
    if (
      membership.purchaseId === purchase.id &&
      membership.currentPeriodEnd &&
      event.created > lastPaidAt &&
      event.created >= lastLifecycleEventAt &&
      event.created * 1000 >= membership.currentPeriodEnd.getTime()
    ) {
      await tx.membership.update({
        where: { id: membership.id },
        data: { status: 'PAST_DUE' },
      });
      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          policyAcceptance: {
            ...acceptance,
            lastLifecycleEventAt: event.created,
            lastRestrictiveEventAt: event.created,
            lastRestrictiveStatus: 'PAST_DUE',
          },
        },
      });
    }
    return true;
  }
  if (
    object.status !== 'paid' ||
    object.amount_paid !== r.amountCents ||
    object.amount_due !== r.amountCents ||
    object.currency !== 'usd' ||
    object.lines?.has_more
  )
    throw new Error(
      'Recovery invoice amount/status is not the approved payment.',
    );
  const paidAt = new Date(object.status_transitions?.paid_at * 1000);
  const paymentIntentId =
    id(
      object.payments?.data?.find(
        (p: ObjectData) => p.payment?.type === 'payment_intent',
      )?.payment?.payment_intent,
    ) ?? id(object.payment_intent);
  if (!Number.isFinite(paidAt.getTime()) || !paymentIntentId)
    throw new Error('Recovery invoice has no verified paid timestamp/payment.');
  const existingPayment = await tx.paymentRecord.findFirst({
    where: {
      OR: [
        { stripeInvoiceId: object.id },
        { stripePaymentIntentId: paymentIntentId },
      ],
    },
  });
  if (
    existingPayment &&
    existingPayment.stripeInvoiceId === object.id &&
    existingPayment.membershipId === membership.id &&
    membership.purchaseId === purchase.id &&
    ['SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'].includes(
      existingPayment.status,
    )
  )
    return true;
  if (
    existingPayment &&
    ['REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'].includes(
      existingPayment.status,
    )
  )
    throw new Error(
      'Recovery payment was refunded or disputed before reconciliation.',
    );
  const first = object.billing_reason === 'subscription_create';
  const period = recoveryPeriod(r);
  let start = period.start;
  let end = period.end;
  if (first) {
    if (acceptance.firstInvoiceId) {
      if (
        acceptance.firstInvoiceId !== object.id ||
        membership.purchaseId !== purchase.id
      )
        throw new Error('Duplicate initial recovery invoice.');
      return true;
    }
    // Validate at the actual paid time, not delivery time; a delayed webhook must still settle a paid invoice.
    if (
      paidAt >= period.end ||
      !eligibleRecovery(user, user.memberships, new Date(period.start))
    )
      throw new Error('Legacy recovery state changed before payment.');
    if (purchase.status !== 'PENDING')
      throw new Error('Recovery purchase is not pending.');
  } else {
    // The shared Purchase retains refund/dispute history from older cycles.
    // This independently verified paid invoice owns the new period's access.
    if (!acceptance.firstInvoiceId || membership.purchaseId !== purchase.id)
      throw new Error(
        'Recovery renewal arrived before initial payment was reconciled.',
      );
    const recurring = object.lines?.data?.filter(
      (line: ObjectData) =>
        line.amount === r.amountCents &&
        (line.parent?.type === 'subscription_item_details' ||
          line.type === 'subscription' ||
          line.price?.recurring),
    );
    if (recurring?.length !== 1)
      throw new Error('Recovery renewal period is ambiguous.');
    start = new Date(recurring[0].period?.start * 1000);
    end = new Date(recurring[0].period?.end * 1000);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start < period.end ||
      end <= start
    )
      throw new Error('Recovery renewal period is invalid.');
  }

  const paymentData = {
    userId: r.userId,
    purchaseId: purchase.id,
    membershipId: membership.id,
    kind: 'MEMBERSHIP_RENEWAL' as const,
    status: 'SUCCEEDED' as const,
    amountCents: r.amountCents,
    currency: 'usd',
    customerName: user.name,
    customerEmail: user.email,
    stripeCustomerId: user.stripeCustomerId,
    stripeInvoiceId: object.id,
    stripePaymentIntentId: paymentIntentId,
    stripeSubscriptionId: subscriptionId,
    occurredAt: paidAt,
  };
  if (existingPayment) {
    await tx.paymentRecord.update({
      where: { id: existingPayment.id },
      data: paymentData,
    });
  } else {
    await tx.paymentRecord.create({
      data: { ...paymentData, stripeEventId: event.id },
    });
  }
  // A delayed old invoice still belongs in financial history, but must not reset a newer paid period.
  if (!first && start < membership.currentPeriodStart) return true;
  await tx.purchase.update({
    where: { id: purchase.id },
    data: {
      ...(first
        ? {
            status: 'PAID' as const,
            paidAt,
            stripePaymentIntentId: paymentIntentId,
          }
        : {}),
      policyAcceptance: {
        ...acceptance,
        ...(first ? { firstInvoiceId: object.id, subscriptionId } : {}),
        lastPaidAt: Math.max(lastPaidAt, paidAt.getTime() / 1000),
      },
    },
  });
  // Payment settles its financial period, but cannot undo a later restriction.
  // Same-second pause/cancellation wins the tie; a paid invoice resolves past_due.
  const restrictiveStatus = ['PAST_DUE', 'PAUSED', 'CANCELLED'].includes(
    acceptance.lastRestrictiveStatus,
  )
    ? (acceptance.lastRestrictiveStatus as 'PAST_DUE' | 'PAUSED' | 'CANCELLED')
    : membership.status;
  const retainRestriction =
    lastRestrictiveEventAt > paidAt.getTime() / 1000 ||
    (lastRestrictiveEventAt === paidAt.getTime() / 1000 &&
      ['PAUSED', 'CANCELLED'].includes(restrictiveStatus));
  await tx.membership.update({
    where: { id: membership.id },
    data: {
      purchaseId: purchase.id,
      productId: r.productId,
      stripeSubscriptionId: subscriptionId,
      status: retainRestriction ? restrictiveStatus : 'ACTIVE',
      currentPeriodStart: start,
      currentPeriodEnd: end,
    },
  });
  if (first && r.standardAccountId) {
    const legacy = await tx.creditAccount.findUnique({
      where: { id: r.standardAccountId },
    });
    if (
      !legacy ||
      legacy.userId !== r.userId ||
      !legacy.isUnlimited ||
      legacy.sourcePurchaseId
    )
      throw new Error('Legacy VIP class account changed.');
    await tx.creditAccount.update({
      where: { id: legacy.id },
      data: {
        sourcePurchaseId: purchase.id,
        validFrom: start,
        validUntil: end,
      },
    });
    // Existing calendar-month VIP event account is deliberately untouched.
    return true;
  }
  const account = await tx.creditAccount.upsert({
    where: { sourcePurchaseId: purchase.id },
    update: { validFrom: start, validUntil: end },
    create: {
      userId: r.userId,
      sourcePurchaseId: purchase.id,
      label: r.name,
      isUnlimited: r.kind === 'VIP',
      validFrom: start,
      validUntil: end,
    },
    include: { entries: true },
  });
  if (
    r.kind === 'VIP' ||
    account.entries.some((e) => e.sourceStripeInvoiceId === object.id)
  )
    return true;
  const reset = renewalCreditReset({
    entries: account.entries,
    includedCredits: 8,
  });
  if (reset.expirationQuantity) {
    await tx.creditLedgerEntry.upsert({
      where: { sourceReturnKey: `membership-renewal-expiry:${object.id}` },
      update: {},
      create: {
        creditAccountId: account.id,
        sourceReturnKey: `membership-renewal-expiry:${object.id}`,
        type: 'EXPIRE',
        quantity: reset.expirationQuantity,
        reason: 'Unused credits expired at membership renewal',
      },
    });
  }
  await tx.creditLedgerEntry.upsert({
    where: { sourceStripeInvoiceId: object.id },
    update: {},
    create: {
      creditAccountId: account.id,
      sourceStripeInvoiceId: object.id,
      type: 'GRANT',
      quantity: 8,
      reason: first
        ? 'Paid September membership recovery'
        : 'Membership renewal',
    },
  });
  if (first) {
    const entries = await tx.creditLedgerEntry.findMany({
      where: {
        creditAccountId: { in: [...r.legacyCreditAccountIds] },
        bookingId: { not: null },
      },
    });
    const bookings = await tx.booking.findMany({
      where: {
        id: { in: entries.flatMap((e) => (e.bookingId ? [e.bookingId] : [])) },
        userId: r.userId,
        occurrence: { template: { isEvent: false } },
      },
      select: { id: true, occurrence: { select: { startAt: true } } },
    });
    const starts = new Map(bookings.map((b) => [b.id, b.occurrence.startAt]));
    const covered = entries.filter((e) => {
      const at = e.bookingId ? starts.get(e.bookingId) : null;
      return (
        r.legacyCreditAccountIds.includes(e.creditAccountId) &&
        at &&
        at >= period.start &&
        at < period.end
      );
    });
    const consumed = recoveryCreditConsumption(
      r,
      covered.map((e) => ({ ...e, startAt: starts.get(e.bookingId!)! })),
    );
    if (consumed > 8)
      throw new Error(
        'Legacy OG usage exceeds the reviewed allowance; studio reconciliation required.',
      );
    // Preserve original reservation IDs so the existing cancellation/restore policies return
    // credits to this paid account, not to an expired imported account.
    if (covered.length)
      await tx.creditLedgerEntry.updateMany({
        where: {
          id: { in: covered.map((e) => e.id) },
          creditAccountId: { in: [...r.legacyCreditAccountIds] },
        },
        data: { creditAccountId: account.id },
      });
  }
  return true;
}
