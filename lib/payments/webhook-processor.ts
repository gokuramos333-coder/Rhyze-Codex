import type Stripe from 'stripe';
import type { MembershipStatus, Prisma } from '@prisma/client';
import { queueEmail } from '@/lib/notifications/email-queue';
import { commissionCentsForProduct } from '@/lib/domain/referrals/referral-service';
import { renewalCreditReset } from '@/lib/domain/credits/membership-renewal';

type StripeObject = Record<string, any>;

export function creditGrantForPayment(
  product: { billingInterval: string; includedCredits: number | null },
  payment: 'CHECKOUT' | 'INVOICE',
) {
  if (!product.includedCredits) return null;
  if (payment === 'CHECKOUT') return product.billingInterval === 'ONE_TIME' ? product.includedCredits : null;
  return product.billingInterval === 'ONE_TIME' ? null : product.includedCredits;
}

function idOf(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) return String(value.id);
  return null;
}

function invoiceSubscriptionId(invoice: StripeObject) {
  return idOf(invoice.subscription) || idOf(invoice.parent?.subscription_details?.subscription);
}

function invoicePurchaseId(invoice: StripeObject) {
  return invoice.parent?.subscription_details?.metadata?.purchaseId || invoice.metadata?.purchaseId || null;
}

function invoicePaymentIntentId(invoice: StripeObject) {
  const payment = invoice.payments?.data?.find(
    (entry: StripeObject) => entry.payment?.type === 'payment_intent',
  );
  return idOf(payment?.payment?.payment_intent) || idOf(invoice.payment_intent);
}

function invoicePeriodEnd(invoice: StripeObject, fallback: number) {
  return eventDate(invoice.lines?.data?.[0]?.period?.end, fallback);
}

function eventDate(seconds: unknown, fallback: number) {
  return new Date((typeof seconds === 'number' ? seconds : fallback) * 1000);
}

export function stripeMembershipStatus(status: string): MembershipStatus {
  if (status === 'trialing') return 'TRIALING';
  if (status === 'active') return 'ACTIVE';
  if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') return 'PAST_DUE';
  if (status === 'paused') return 'PAUSED';
  if (status === 'incomplete_expired') return 'EXPIRED';
  return 'CANCELLED';
}

export function deriveStripeEventAction(event: Stripe.Event) {
  const object = event.data.object as unknown as StripeObject;
  if (
    event.type === 'checkout.session.completed' &&
    object.payment_status &&
    object.payment_status !== 'paid' &&
    object.payment_status !== 'no_payment_required'
  ) {
    return { type: 'IGNORE' as const };
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    return {
      type: 'CHECKOUT_PAID' as const,
      sessionId: String(object.id),
      purchaseId: object.metadata?.purchaseId || null,
      commerceOrderId: object.metadata?.commerceOrderId || null,
      customerId: idOf(object.customer),
      paymentIntentId: idOf(object.payment_intent),
      subscriptionId: idOf(object.subscription),
      customerName: object.customer_details?.name || object.metadata?.customerName || null,
      customerEmail: object.customer_details?.email || object.customer_email || object.metadata?.customerEmail || null,
      occurredAt: eventDate(object.created, event.created),
    };
  }
  if (event.type === 'checkout.session.async_payment_failed') {
    return {
      type: 'CHECKOUT_FAILED' as const,
      purchaseId: object.metadata?.purchaseId || null,
      commerceOrderId: object.metadata?.commerceOrderId || null,
      occurredAt: eventDate(object.created, event.created),
    };
  }
  if (event.type === 'invoice.paid') {
    return {
      type: 'INVOICE_PAID' as const,
      invoiceId: String(object.id),
      subscriptionId: invoiceSubscriptionId(object),
      purchaseId: invoicePurchaseId(object),
      customerId: idOf(object.customer),
      paymentIntentId: invoicePaymentIntentId(object),
      amountCents: Number(object.amount_paid || 0),
      currency: String(object.currency || 'usd'),
      billingReason: String(object.billing_reason || ''),
      occurredAt: eventDate(object.status_transitions?.paid_at, event.created),
      currentPeriodEnd: invoicePeriodEnd(object, event.created),
    };
  }
  if (event.type === 'invoice.payment_failed') {
    return {
      type: 'INVOICE_FAILED' as const,
      invoiceId: String(object.id),
      subscriptionId: invoiceSubscriptionId(object),
      purchaseId: invoicePurchaseId(object),
      customerId: idOf(object.customer),
      paymentIntentId: invoicePaymentIntentId(object),
      amountCents: Number(object.amount_due || 0),
      currency: String(object.currency || 'usd'),
      occurredAt: eventDate(object.created, event.created),
      currentPeriodEnd: invoicePeriodEnd(object, event.created),
    };
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    return {
      type: 'SUBSCRIPTION_CHANGED' as const,
      subscriptionId: String(object.id),
      customerId: idOf(object.customer),
      status: stripeMembershipStatus(String(object.status)),
      currentPeriodStart: eventDate(object.current_period_start, event.created),
      currentPeriodEnd: eventDate(object.current_period_end, event.created),
      cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
    };
  }
  if (event.type === 'charge.refunded') {
    return {
      type: 'PAYMENT_REFUNDED' as const,
      paymentIntentId: idOf(object.payment_intent),
      amountCents: Number(object.amount_refunded || 0),
      fullyRefunded: Boolean(object.refunded),
    };
  }
  if (event.type === 'charge.dispute.created') {
    return {
      type: 'PAYMENT_DISPUTED' as const,
      paymentIntentId: idOf(object.payment_intent),
      amountCents: Number(object.amount || 0),
    };
  }
  return { type: 'IGNORE' as const };
}

async function notifyPaymentFailure(
  tx: Prisma.TransactionClient,
  user: { id: string; email: string; name: string | null },
  amountCents: number,
) {
  await tx.inAppNotification.create({
    data: {
      userId: user.id,
      title: 'Payment needs attention',
      body: `Stripe could not collect $${(amountCents / 100).toFixed(2)}. Update your payment method to keep your membership active.`,
      link: '/member/billing',
    },
  });
  await queueEmail(tx, {
    userId: user.id,
    to: user.email,
    subject: 'Your Rhyze payment needs attention',
    template: 'PAYMENT_FAILED',
    payload: { name: user.name || 'Rhyzer', amountCents, billingUrl: '/member/billing' },
  });
}

async function fulfillProductPurchase(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
  action: Extract<ReturnType<typeof deriveStripeEventAction>, { type: 'CHECKOUT_PAID' }>,
) {
  if (!action.purchaseId) return;
  const purchase = await tx.purchase.update({
    where: { id: action.purchaseId },
    data: {
      status: 'PAID',
      paidAt: action.occurredAt,
      stripeCheckoutSessionId: action.sessionId,
      stripePaymentIntentId: action.paymentIntentId,
    },
    include: { product: true, user: true },
  });
  if (action.customerId) {
    await tx.user.update({ where: { id: purchase.userId }, data: { stripeCustomerId: action.customerId } });
  }
  let membershipId: string | null = null;
  if (purchase.product.kind === 'INTRO_TRIAL' || purchase.product.billingInterval !== 'ONE_TIME') {
    const membership = await tx.membership.upsert({
      where: { purchaseId: purchase.id },
      update: {
        status: purchase.product.kind === 'INTRO_TRIAL' ? 'TRIALING' : 'ACTIVE',
        stripeSubscriptionId: action.subscriptionId,
      },
      create: {
        purchaseId: purchase.id,
        productId: purchase.productId,
        userId: purchase.userId,
        status: purchase.product.kind === 'INTRO_TRIAL' ? 'TRIALING' : 'ACTIVE',
        stripeSubscriptionId: action.subscriptionId,
        currentPeriodStart: action.occurredAt,
        currentPeriodEnd: null,
        activatedAt: null,
      },
    });
    membershipId = membership.id;
  }
  if (purchase.product.kind === 'INTRO_TRIAL') {
    await tx.creditAccount.upsert({
      where: { sourcePurchaseId: purchase.id },
      update: {
        label: 'Intro trial — unlimited standard class credits for 7 days',
        isUnlimited: true,
      },
      create: {
        userId: purchase.userId,
        sourcePurchaseId: purchase.id,
        label: 'Intro trial — unlimited standard class credits for 7 days',
        isUnlimited: true,
        validFrom: action.occurredAt,
        validUntil: null,
      },
    });
  }
  const checkoutCredits = creditGrantForPayment(purchase.product, 'CHECKOUT');
  if (purchase.product.kind !== 'INTRO_TRIAL' && purchase.product.billingInterval === 'ONE_TIME' && (checkoutCredits || purchase.product.isUnlimited)) {
    await tx.creditAccount.upsert({
      where: { sourcePurchaseId: purchase.id },
      update: {},
      create: {
        userId: purchase.userId,
        sourcePurchaseId: purchase.id,
        label: purchase.product.name,
        isUnlimited: purchase.product.isUnlimited,
        entries: checkoutCredits
          ? { create: { type: 'GRANT', quantity: checkoutCredits, reason: 'Purchase' } }
          : undefined,
      },
    });
  }
  if (!action.subscriptionId) {
    let existingPaymentRecordLinked = false;
    if (action.paymentIntentId || action.sessionId) {
      const linked = await tx.paymentRecord.updateMany({
        where: {
          OR: [
            ...(action.paymentIntentId ? [{ stripePaymentIntentId: action.paymentIntentId }] : []),
            ...(action.sessionId ? [{ stripeCheckoutSessionId: action.sessionId }] : []),
          ],
        },
        data: {
          userId: purchase.userId,
          purchaseId: purchase.id,
          membershipId,
          kind: 'PRODUCT_PURCHASE',
          status: 'SUCCEEDED',
          amountCents: purchase.amountCents,
          currency: purchase.currency,
          customerName: purchase.user.name,
          customerEmail: purchase.user.email,
          stripeCustomerId: action.customerId,
          stripeCheckoutSessionId: action.sessionId,
          occurredAt: action.occurredAt,
        },
      });
      existingPaymentRecordLinked = linked.count > 0;
    }
    if (!existingPaymentRecordLinked) {
      const paymentRecordData = {
        userId: purchase.userId,
        purchaseId: purchase.id,
        membershipId,
        kind: 'PRODUCT_PURCHASE' as const,
        status: 'SUCCEEDED' as const,
        amountCents: purchase.amountCents,
        currency: purchase.currency,
        customerName: purchase.user.name,
        customerEmail: purchase.user.email,
        stripeEventId: event.id,
        stripeCustomerId: action.customerId,
        stripeCheckoutSessionId: action.sessionId,
        stripePaymentIntentId: action.paymentIntentId,
        occurredAt: action.occurredAt,
      };
      const existingPaymentRecord = await tx.paymentRecord.findFirst({
        where: {
          OR: [
            { stripeEventId: event.id },
            ...(action.sessionId ? [{ stripeCheckoutSessionId: action.sessionId }] : []),
            ...(action.paymentIntentId ? [{ stripePaymentIntentId: action.paymentIntentId }] : []),
          ],
        },
        select: { id: true },
      });
      if (existingPaymentRecord) {
        await tx.paymentRecord.update({ where: { id: existingPaymentRecord.id }, data: paymentRecordData });
      } else {
        await tx.paymentRecord.create({ data: paymentRecordData });
      }
    }
  }
  if (purchase.discountCents > 0) {
    const attribution = await tx.referralAttribution.findUnique({
      where: { referredUserId: purchase.userId },
      include: { referralCode: true },
    });
    const redeemed = await tx.discountRedemption.findUnique({ where: { userId: purchase.userId } });
    const commission = commissionCentsForProduct(purchase.product.kind);
    if (attribution && !redeemed && commission > 0) {
      await tx.discountRedemption.create({
        data: { userId: purchase.userId, purchaseId: purchase.id, referralCodeId: attribution.referralCodeId, discountCents: purchase.discountCents },
      });
      await tx.referralCommission.create({
        data: { instructorId: attribution.referralCode.instructorId, referredUserId: purchase.userId, purchaseId: purchase.id, amountCents: commission },
      });
    }
  }
  const membershipPurchase = purchase.product.kind === 'INTRO_TRIAL' || purchase.product.billingInterval !== 'ONE_TIME';
  await queueEmail(tx, {
    userId: purchase.userId,
    to: purchase.user.email,
    subject: membershipPurchase
      ? `Welcome to ${purchase.product.name}`
      : 'Your Rhyze purchase is confirmed',
    template: membershipPurchase ? 'MEMBERSHIP_PURCHASE_CONFIRMATION' : 'PURCHASE_CONFIRMATION',
    payload: {
      name: purchase.user.name || 'Rhyzer',
      planName: purchase.product.name,
      itemName: purchase.product.name,
      amount: purchase.amountCents,
      billingSchedule: purchase.product.billingInterval === 'ONE_TIME' ? 'One-time purchase' : 'Recurring membership',
      billingUrl: '/member/billing',
      receiptUrl: '/member/billing',
    },
    dedupeKey: `purchase-confirmation:${purchase.id}`,
  });
  await queueEmail(tx, {
    userId: purchase.userId,
    to: purchase.user.email,
    subject: 'Your Rhyze payment receipt',
    template: 'PAYMENT_RECEIPT',
    payload: {
      name: purchase.user.name || 'Rhyzer',
      itemName: purchase.product.name,
      amount: purchase.amountCents,
      paidAt: action.occurredAt.toLocaleDateString('en-US'),
      paymentMethod: 'Your Stripe payment method',
      receiptUrl: '/member/billing',
    },
    dedupeKey: `payment-receipt:purchase:${purchase.id}`,
  });
  await queueEmail(tx, {
    to: 'melissa@rhyzefit.com',
    cc: ['vanessa@rhyzefit.com'],
    subject: `New Rhyze purchase: ${purchase.user.name || purchase.user.email}`,
    template: 'NEW_PURCHASE_ADMIN',
    payload: {
      memberName: purchase.user.name || 'Member',
      memberEmail: purchase.user.email,
      itemName: purchase.product.name,
      amount: purchase.amountCents,
      adminUrl: '/admin/payments',
    },
    dedupeKey: `new-purchase-admin:${purchase.id}`,
  });
}

async function fulfillCommerceOrder(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
  action: Extract<ReturnType<typeof deriveStripeEventAction>, { type: 'CHECKOUT_PAID' }>,
) {
  if (!action.commerceOrderId) return;
  const order = await tx.commerceOrder.update({
    where: { id: action.commerceOrderId },
    data: {
      status: 'PAID',
      paidAt: action.occurredAt,
      stripeCheckoutSessionId: action.sessionId,
      stripePaymentIntentId: action.paymentIntentId,
      customerName: action.customerName || undefined,
      customerEmail: action.customerEmail || undefined,
    },
    include: {
      occurrence: { include: { template: true } },
      items: true,
      user: true,
    },
  });
  if (order.userId && action.customerId) {
    await tx.user.update({ where: { id: order.userId }, data: { stripeCustomerId: action.customerId } });
  }
  if (order.kind === 'EVENT' && order.userId && order.occurrenceId && order.occurrence) {
    const booked = await tx.booking.count({ where: { occurrenceId: order.occurrenceId, status: 'CONFIRMED' } });
    if (booked + order.occurrence.historicalSignupCount >= order.occurrence.capacity) {
      await tx.commerceOrder.update({ where: { id: order.id }, data: { status: 'FULFILLMENT_REVIEW' } });
    } else {
      await tx.booking.upsert({
        where: { occurrenceId_userId: { occurrenceId: order.occurrenceId, userId: order.userId } },
        update: { status: 'CONFIRMED', cancelledAt: null, source: 'STRIPE_EVENT' },
        create: { occurrenceId: order.occurrenceId, userId: order.userId, source: 'STRIPE_EVENT' },
      });
    }
  }
  const paymentRecordData = {
    userId: order.userId,
    commerceOrderId: order.id,
    kind: order.kind,
    status: 'SUCCEEDED' as const,
    amountCents: order.amountCents,
    currency: order.currency,
    customerName: order.user?.name || order.customerName || action.customerName,
    customerEmail: order.user?.email || order.customerEmail || action.customerEmail,
    stripeEventId: event.id,
    stripeCustomerId: action.customerId,
    stripeCheckoutSessionId: action.sessionId,
    stripePaymentIntentId: action.paymentIntentId,
    occurredAt: action.occurredAt,
  };
  const existingPaymentRecord = await tx.paymentRecord.findFirst({
    where: {
      OR: [
        { stripeEventId: event.id },
        ...(action.sessionId ? [{ stripeCheckoutSessionId: action.sessionId }] : []),
        ...(action.paymentIntentId ? [{ stripePaymentIntentId: action.paymentIntentId }] : []),
      ],
    },
    select: { id: true },
  });
  if (existingPaymentRecord) {
    await tx.paymentRecord.update({ where: { id: existingPaymentRecord.id }, data: paymentRecordData });
  } else {
    await tx.paymentRecord.create({ data: paymentRecordData });
  }
  const itemName = order.kind === 'EVENT'
    ? order.occurrence?.template.name || 'Rhyze special event'
    : order.items.map((item) => item.name).join(', ') || 'Rhyze shop purchase';
  const recipient = order.user?.email || order.customerEmail;
  if (recipient) {
    await queueEmail(tx, {
      userId: order.userId || undefined,
      to: recipient,
      subject: order.kind === 'EVENT' ? `You’re booked for ${itemName}` : 'Your Rhyze purchase is confirmed',
      template: order.kind === 'EVENT' ? 'EVENT_PURCHASE_CONFIRMATION' : 'PURCHASE_CONFIRMATION',
      payload: {
        name: order.user?.name || 'Rhyzer',
        eventName: itemName,
        itemName,
        eventDate: order.occurrence?.startAt.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric' }),
        eventTime: order.occurrence?.startAt.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }),
        amount: order.amountCents,
        bookingsUrl: '/member/bookings',
        receiptUrl: '/member/billing',
      },
      dedupeKey: `commerce-confirmation:${order.id}`,
    });
    await queueEmail(tx, {
      userId: order.userId || undefined,
      to: recipient,
      subject: 'Your Rhyze payment receipt',
      template: 'PAYMENT_RECEIPT',
      payload: {
        name: order.user?.name || 'Rhyzer',
        itemName,
        amount: order.amountCents,
        paidAt: action.occurredAt.toLocaleDateString('en-US'),
        paymentMethod: 'Your Stripe payment method',
        receiptUrl: '/member/billing',
      },
      dedupeKey: `payment-receipt:commerce:${order.id}`,
    });
    await queueEmail(tx, {
      to: 'melissa@rhyzefit.com',
      cc: ['vanessa@rhyzefit.com'],
      subject: `New Rhyze purchase: ${order.user?.name || recipient}`,
      template: 'NEW_PURCHASE_ADMIN',
      payload: {
        memberName: order.user?.name || 'Guest',
        memberEmail: recipient,
        itemName,
        amount: order.amountCents,
        adminUrl: '/admin/payments',
      },
      dedupeKey: `new-purchase-admin:commerce:${order.id}`,
    });
  }
}

export async function processStripeEvent(tx: Prisma.TransactionClient, event: Stripe.Event) {
  const action = deriveStripeEventAction(event);
  if (action.type === 'IGNORE') return;
  if (action.type === 'CHECKOUT_PAID') {
    await fulfillProductPurchase(tx, event, action);
    await fulfillCommerceOrder(tx, event, action);
    return;
  }
  if (action.type === 'CHECKOUT_FAILED') {
    if (action.purchaseId) await tx.purchase.updateMany({ where: { id: action.purchaseId, status: 'PENDING' }, data: { status: 'FAILED', failedAt: action.occurredAt } });
    if (action.commerceOrderId) await tx.commerceOrder.updateMany({ where: { id: action.commerceOrderId, status: 'PENDING' }, data: { status: 'PAYMENT_FAILED', failedAt: action.occurredAt } });
    return;
  }
  if (action.type === 'INVOICE_PAID' && action.subscriptionId) {
    let membership = await tx.membership.findUnique({
      where: { stripeSubscriptionId: action.subscriptionId },
      include: { user: true, purchase: true, product: true },
    });
    if (!membership && action.purchaseId) {
      const purchase = await tx.purchase.findUnique({ where: { id: action.purchaseId }, include: { product: true } });
      if (purchase && purchase.product.billingInterval !== 'ONE_TIME') {
        await tx.purchase.update({ where: { id: purchase.id }, data: { status: 'PAID', paidAt: action.occurredAt } });
        await tx.membership.upsert({
          where: { purchaseId: purchase.id },
          update: { stripeSubscriptionId: action.subscriptionId, status: 'ACTIVE', currentPeriodEnd: action.currentPeriodEnd },
          create: {
            userId: purchase.userId,
            productId: purchase.productId,
            purchaseId: purchase.id,
            stripeSubscriptionId: action.subscriptionId,
            status: 'ACTIVE',
            currentPeriodStart: action.occurredAt,
            currentPeriodEnd: action.currentPeriodEnd,
            activatedAt: action.occurredAt,
          },
        });
        membership = await tx.membership.findUnique({
          where: { stripeSubscriptionId: action.subscriptionId },
          include: { user: true, purchase: true, product: true },
        });
      }
    }
    if (!membership) return;
    if (membership.purchaseId && action.paymentIntentId) {
      await tx.purchase.update({
        where: { id: membership.purchaseId },
        data: { stripePaymentIntentId: action.paymentIntentId },
      });
    }
    await tx.membership.update({
      where: { id: membership.id },
      data: { status: 'ACTIVE', currentPeriodStart: action.occurredAt, currentPeriodEnd: action.currentPeriodEnd },
    });
    const invoiceCredits = creditGrantForPayment(membership.product, 'INVOICE');
    if (membership.purchaseId && (invoiceCredits || membership.product.isUnlimited)) {
      const account = await tx.creditAccount.upsert({
        where: { sourcePurchaseId: membership.purchaseId },
        update: { isUnlimited: membership.product.isUnlimited, validUntil: action.currentPeriodEnd },
        create: {
          userId: membership.userId,
          sourcePurchaseId: membership.purchaseId,
          label: membership.product.name,
          isUnlimited: membership.product.isUnlimited,
          validUntil: action.currentPeriodEnd,
        },
        include: { entries: true },
      });
      if (invoiceCredits) {
        const invoiceAlreadyGranted = account.entries.some(
          (entry) => entry.sourceStripeInvoiceId === action.invoiceId,
        );
        if (!invoiceAlreadyGranted) {
          const reset = renewalCreditReset({
            entries: account.entries,
            includedCredits: invoiceCredits,
          });
          if (reset.expirationQuantity !== 0) {
            await tx.creditLedgerEntry.upsert({
              where: { sourceReturnKey: `membership-renewal-expiry:${action.invoiceId}` },
              update: {},
              create: {
                creditAccountId: account.id,
                sourceReturnKey: `membership-renewal-expiry:${action.invoiceId}`,
                type: 'EXPIRE',
                quantity: reset.expirationQuantity,
                reason: 'Unused credits expired at membership renewal',
              },
            });
          }
        }
        await tx.creditLedgerEntry.upsert({
          where: { sourceStripeInvoiceId: action.invoiceId },
          update: {},
          create: {
            creditAccountId: account.id,
            sourceStripeInvoiceId: action.invoiceId,
            type: 'GRANT',
            quantity: invoiceCredits,
            reason: 'Membership renewal',
          },
        });
      }
    }
    await tx.paymentRecord.upsert({
      where: { stripeInvoiceId: action.invoiceId },
      update: {
        status: 'SUCCEEDED',
        amountCents: action.amountCents,
        stripePaymentIntentId: action.paymentIntentId,
        customerName: membership.user.name,
        customerEmail: membership.user.email,
      },
      create: {
        userId: membership.userId,
        purchaseId: membership.purchaseId,
        membershipId: membership.id,
        kind: 'MEMBERSHIP_RENEWAL',
        status: 'SUCCEEDED',
        amountCents: action.amountCents,
        currency: action.currency,
        customerName: membership.user.name,
        customerEmail: membership.user.email,
        stripeEventId: event.id,
        stripeCustomerId: action.customerId,
        stripePaymentIntentId: action.paymentIntentId,
        stripeInvoiceId: action.invoiceId,
        stripeSubscriptionId: action.subscriptionId,
        occurredAt: action.occurredAt,
      },
    });
    if (action.billingReason !== 'subscription_create') {
      await queueEmail(tx, {
        userId: membership.userId,
        to: membership.user.email,
        subject: `${membership.product.name} renewed`,
        template: 'MEMBERSHIP_RENEWED',
        payload: {
          name: membership.user.name || 'Rhyzer',
          planName: membership.product.name,
          amount: action.amountCents,
          nextBillingDate: action.currentPeriodEnd.toLocaleDateString('en-US'),
          billingUrl: '/member/billing',
        },
        dedupeKey: `membership-renewed:${action.invoiceId}`,
      });
    }
    return;
  }
  if (action.type === 'INVOICE_FAILED' && action.subscriptionId) {
    const membership = await tx.membership.findUnique({ where: { stripeSubscriptionId: action.subscriptionId }, include: { user: true } });
    if (!membership) return;
    await tx.membership.update({ where: { id: membership.id }, data: { status: 'PAST_DUE' } });
    await tx.paymentRecord.upsert({
      where: { stripeInvoiceId: action.invoiceId },
      update: {
        status: 'FAILED',
        amountCents: action.amountCents,
        stripePaymentIntentId: action.paymentIntentId,
        customerName: membership.user.name,
        customerEmail: membership.user.email,
      },
      create: {
        userId: membership.userId,
        membershipId: membership.id,
        kind: 'MEMBERSHIP_RENEWAL',
        status: 'FAILED',
        amountCents: action.amountCents,
        currency: action.currency,
        customerName: membership.user.name,
        customerEmail: membership.user.email,
        stripeEventId: event.id,
        stripeCustomerId: action.customerId,
        stripePaymentIntentId: action.paymentIntentId,
        stripeInvoiceId: action.invoiceId,
        stripeSubscriptionId: action.subscriptionId,
        occurredAt: action.occurredAt,
      },
    });
    await notifyPaymentFailure(tx, membership.user, action.amountCents);
    return;
  }
  if (action.type === 'SUBSCRIPTION_CHANGED') {
    await tx.membership.updateMany({
      where: { stripeSubscriptionId: action.subscriptionId },
      data: {
        status: action.status,
        currentPeriodStart: action.currentPeriodStart,
        currentPeriodEnd: action.currentPeriodEnd,
        cancelAtPeriodEnd: action.cancelAtPeriodEnd,
      },
    });
    return;
  }
  if ((action.type === 'PAYMENT_REFUNDED' || action.type === 'PAYMENT_DISPUTED') && action.paymentIntentId) {
    const record = await tx.paymentRecord.findUnique({ where: { stripePaymentIntentId: action.paymentIntentId } });
    if (!record) return;
    const status = action.type === 'PAYMENT_DISPUTED'
      ? 'DISPUTED'
      : action.fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await tx.paymentRecord.update({
      where: { id: record.id },
      data: { status, refundedAmountCents: action.type === 'PAYMENT_REFUNDED' ? action.amountCents : record.refundedAmountCents },
    });
    if (record.purchaseId) await tx.purchase.update({
      where: { id: record.purchaseId },
      data: action.type === 'PAYMENT_DISPUTED'
        ? { status: 'FAILED' }
        : { status: action.fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED', refundedAmountCents: action.amountCents },
    });
    if (record.commerceOrderId) await tx.commerceOrder.update({
      where: { id: record.commerceOrderId },
      data: action.type === 'PAYMENT_DISPUTED'
        ? { status: 'DISPUTED' }
        : { status: action.fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED', refundedAmountCents: action.amountCents },
    });
  }
}
