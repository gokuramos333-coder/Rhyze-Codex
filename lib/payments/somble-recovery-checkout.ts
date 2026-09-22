import type Stripe from 'stripe';
import { attributionMetadata } from '@/lib/attribution/first-touch';
import { requiresLiveStripe } from '@/lib/payments/stripe-mode';
import { Prisma, type PrismaClient, type Product } from '@prisma/client';
import {
  eligibleRecovery,
  RECOVERY_VERSION,
  recoveryCheckoutParams,
  recoveryPurchaseId,
  type Recovery,
} from '@/lib/domain/memberships/somble-billing-recovery';

export function assertRecoveryProduct(r: Recovery, product: Product | null) {
  if (
    !product ||
    product.id !== r.productId ||
    product.slug !== r.productSlug ||
    product.priceCents !== r.amountCents ||
    product.kind !== r.kind ||
    product.billingInterval !== 'MONTHLY' ||
    product.isPublic ||
    !product.isActive ||
    product.isUnlimited !== (r.kind === 'VIP') ||
    product.includedCredits !== (r.kind === 'VIP' ? null : 8)
  )
    throw new Error('Recovery product changed; contact the studio.');
}

type Acceptance = {
  recovery: string;
  membershipId: string;
  attempt: number;
  attemptAt: string;
  origin: string;
  customerId?: string;
  previousTestCheckoutSessionId?: string;
};
export async function startSombleRecoveryCheckout(
  db: PrismaClient,
  stripe: Stripe,
  input: {
    userId: string;
    consent: boolean;
    retryExpired?: boolean;
    origin: string;
    now?: Date;
  },
): Promise<string> {
  if (!input.consent)
    throw new Error('Explicit recurring billing consent is required.');
  const now = input.now ?? new Date();
  const origin = new URL(input.origin);
  if (origin.protocol !== 'https:' || origin.origin !== input.origin)
    throw new Error('Canonical app origin is invalid.');
  const user = await db.user.findUnique({
    where: { id: input.userId },
    include: { memberships: { include: { product: true } } },
  });
  const r = user && eligibleRecovery(user, user.memberships, now);
  if (!r) throw new Error('Recovery is unavailable; contact the studio.');
  if (r.kind === 'VIP') {
    await db.product.upsert({
      where: { id: r.productId },
      update: {},
      create: {
        id: r.productId,
        slug: r.productSlug,
        name: r.name,
        description: 'Private founding VIP membership billing recovery.',
        kind: 'VIP',
        priceCents: 19900,
        billingInterval: 'MONTHLY',
        includedCredits: null,
        isUnlimited: true,
        isPublic: false,
        isActive: true,
        eligibleCategoryIds: [],
      },
    });
  }
  assertRecoveryProduct(
    r,
    await db.product.findUnique({ where: { id: r.productId } }),
  );
  let purchase = await db.purchase.upsert({
    where: { id: recoveryPurchaseId(r) },
    update: {},
    create: {
      id: recoveryPurchaseId(r),
      userId: r.userId,
      productId: r.productId,
      status: 'PENDING',
      amountCents: r.amountCents,
      policyAcceptedAt: now,
      policyAcceptance: {
        recovery: RECOVERY_VERSION,
        membershipId: r.membershipId,
        attempt: 1,
        attemptAt: now.toISOString(),
        origin: input.origin,
      },
    },
  });
  let acceptance = purchase.policyAcceptance as unknown as Acceptance;
  if (
    purchase.status !== 'PENDING' ||
    purchase.userId !== r.userId ||
    purchase.productId !== r.productId ||
    purchase.amountCents !== r.amountCents ||
    acceptance?.recovery !== RECOVERY_VERSION ||
    acceptance.membershipId !== r.membershipId ||
    !Number.isInteger(acceptance.attempt) ||
    !Number.isFinite(Date.parse(acceptance.attemptAt))
  )
    throw new Error('Recovery purchase needs studio review.');
  const account = await stripe.accounts.retrieve();
  if (account.id !== 'acct_1Tu0UqRIYui0I7dP')
    throw new Error('Unexpected Stripe account; contact the studio.');
  // The September incident promoted a preview with test credentials. Repair only
  // a still-unpaid recovery attempt, on the member's explicit billing consent.
  // Never detach a real customer, subscription, or paid purchase.
  if (requiresLiveStripe() && purchase.stripeCheckoutSessionId?.startsWith('cs_test_')) {
    const oldCustomerId = user.stripeCustomerId;
    if (!oldCustomerId || acceptance.customerId !== oldCustomerId || !(await stripe.balance.retrieve()).livemode)
      throw new Error('Recovery customer needs studio review.');
    try {
      await stripe.customers.retrieve(oldCustomerId);
      throw new Error('Existing live customer needs studio review.');
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'resource_missing')) throw error;
    }
    const liveMatches = await stripe.customers.list({ email: r.email, limit: 2 });
    if (liveMatches.has_more || liveMatches.data.length)
      throw new Error('Existing live customer needs studio review.');
    const previousSessionId = purchase.stripeCheckoutSessionId;
    const next: Acceptance = {
      recovery: acceptance.recovery, membershipId: acceptance.membershipId,
      attempt: acceptance.attempt + 1, attemptAt: now.toISOString(), origin: input.origin,
      previousTestCheckoutSessionId: previousSessionId,
    };
    await db.$transaction(async (tx) => {
      const references = await Promise.all([
        tx.purchase.count({ where: { userId: user.id, id: { not: purchase.id }, stripeCheckoutSessionId: { not: null } } }),
        tx.membership.count({ where: { userId: user.id, stripeSubscriptionId: { not: null } } }),
        tx.paymentRecord.count({ where: { OR: [{ userId: user.id }, { stripeCustomerId: oldCustomerId }] } }),
        tx.commerceOrder.count({ where: { userId: user.id, stripeCheckoutSessionId: { not: null } } }),
      ]);
      if (references.some(Boolean)) throw new Error('Existing payment history needs studio review.');
      const claimed = await tx.purchase.updateMany({
        where: { id: purchase.id, status: 'PENDING', stripeCheckoutSessionId: previousSessionId, policyAcceptance: { equals: acceptance } },
        data: { stripeCheckoutSessionId: null, policyAcceptance: next },
      });
      const detached = await tx.user.updateMany({
        where: { id: user.id, stripeCustomerId: oldCustomerId }, data: { stripeCustomerId: null },
      });
      if (claimed.count !== 1 || detached.count !== 1) throw new Error('Recovery changed; refresh before retrying.');
      await tx.auditLog.create({ data: {
        actorId: user.id, action: 'somble-recovery.test-mode-repaired', entityType: 'Purchase', entityId: purchase.id,
        before: { stripeCheckoutSessionId: previousSessionId, stripeCustomerId: oldCustomerId, policyAcceptance: acceptance },
        after: { stripeCheckoutSessionId: null, stripeCustomerId: null, policyAcceptance: next },
      } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    user.stripeCustomerId = null;
    purchase = { ...purchase, stripeCheckoutSessionId: null };
    acceptance = next;
  }
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    // Never replay a potentially completed customer create beyond Stripe's minimum retention.
    if (now.getTime() - Date.parse(acceptance.attemptAt) >= 23 * 3600000)
      throw new Error('Customer setup needs studio review.');
    const created = await stripe.customers.create(
      {
        email: r.email,
        name: r.firstName,
        metadata: { userId: r.userId, recovery: RECOVERY_VERSION },
      },
      { idempotencyKey: `${RECOVERY_VERSION}:customer:${r.userId}${acceptance.previousTestCheckoutSessionId ? ':live-mode-repair' : ''}` },
    );
    customerId = created.id;
    const attached = await db.user.updateMany({
      where: { id: r.userId, stripeCustomerId: null },
      data: { stripeCustomerId: customerId },
    });
    if (attached.count !== 1)
      throw new Error('Stripe customer changed during setup; contact the studio for review.');
  }
  const customer = await stripe.customers.retrieve(customerId);
  if (
    customer.deleted ||
    customer.email !== r.email ||
    (customer.metadata.userId && customer.metadata.userId !== r.userId)
  )
    throw new Error('Stripe customer identity needs studio review.');
  if (acceptance.customerId && acceptance.customerId !== customerId)
    throw new Error('Stripe customer changed; contact the studio.');
  if (!acceptance.customerId) {
    acceptance = { ...acceptance, customerId };
    purchase = await db.purchase.update({
      where: { id: purchase.id },
      data: { policyAcceptance: acceptance },
    });
  }
  const sessions = await stripe.checkout.sessions.list({
    customer: customerId,
    limit: 100,
  });
  if (sessions.has_more)
    throw new Error('Checkout history needs studio review.');
  const matching = sessions.data.filter(
    (s) =>
      s.metadata?.purchaseId === purchase.id &&
      s.metadata?.recovery === RECOVERY_VERSION,
  );
  const attemptSessions = matching.filter(
    (s) => s.metadata?.attempt === String(acceptance.attempt),
  );
  if (
    attemptSessions.length > 1 ||
    matching.some(
      (s) =>
        s.status === 'complete' ||
        s.payment_status === 'paid' ||
        (s.status === 'open' &&
          s.metadata?.attempt !== String(acceptance.attempt)),
    )
  )
    throw new Error('Existing payment needs studio review.');
  let session = purchase.stripeCheckoutSessionId
    ? await stripe.checkout.sessions.retrieve(purchase.stripeCheckoutSessionId)
    : attemptSessions[0];
  if (
    session &&
    (session.metadata?.purchaseId !== purchase.id ||
      session.customer !== customerId ||
      session.metadata?.attempt !== String(acceptance.attempt))
  )
    throw new Error('Checkout identity needs studio review.');
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  });
  if (subscriptions.has_more || subscriptions.data.length > 0)
    throw new Error('Existing Stripe subscription needs studio review.');
  if (
    session?.status === 'open' &&
    session.payment_status === 'unpaid' &&
    session.url
  ) {
    await db.purchase.update({
      where: { id: purchase.id },
      data: { stripeCheckoutSessionId: session.id },
    });
    return session.url;
  }
  if (session) {
    if (session.status !== 'expired' || session.payment_status !== 'unpaid')
      throw new Error('Checkout needs studio review.');
    if (!input.retryExpired)
      throw new Error(
        'Checkout expired. Confirm retry to create a replacement.',
      );
    const next = {
      ...acceptance,
      attempt: acceptance.attempt + 1,
      attemptAt: now.toISOString(),
    };
    const claimed = await db.purchase.updateMany({
      where: {
        id: purchase.id,
        status: 'PENDING',
        policyAcceptance: { equals: acceptance },
      },
      data: { stripeCheckoutSessionId: null, policyAcceptance: next },
    });
    if (claimed.count !== 1)
      throw new Error(
        'Another checkout request is in progress. Refresh before retrying.',
      );
    acceptance = next;
  }
  const attemptAt = Date.parse(acceptance.attemptAt);
  // Stripe requires expires_at to be at least 30 minutes away. A missing session
  // after half of the fixed one-hour window is ambiguous; never create again.
  if (now.getTime() >= attemptAt + 30 * 60000)
    throw new Error('Checkout setup needs studio review.');
  const params = recoveryCheckoutParams(r, {
    customerId,
    purchaseId: purchase.id,
    origin: acceptance.origin,
    expiresAt: Math.floor(attemptAt / 1000) + 3600,
  });
  params.metadata = { ...params.metadata, ...attributionMetadata(user), attempt: String(acceptance.attempt) };
  session = await stripe.checkout.sessions.create(params, {
    idempotencyKey: `${purchase.id}:checkout:${acceptance.attempt}`,
  });
  if (!session.url || session.status !== 'open')
    throw new Error('Checkout setup needs studio review.');
  await db.purchase.update({
    where: { id: purchase.id },
    data: { stripeCheckoutSessionId: session.id },
  });
  return session.url;
}
