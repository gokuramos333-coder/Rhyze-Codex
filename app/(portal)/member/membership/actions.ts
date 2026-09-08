'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';
import {
  isReferralEligibleProduct,
  referralDiscountCents,
} from '@/lib/domain/referrals/referral-service';
import {
  isProductActiveInWindow,
  isProductAvailable,
} from '@/lib/catalog/product-availability';
import { canAccessPrivateMembership } from '@/lib/catalog/private-membership';
import {
  buildCheckoutCustomerParameters,
  buildSubscriptionData,
} from '@/lib/payments/checkout-config';
import {
  RHYZE_2026_PROMO_DURATION_MONTHS,
  RHYZE_2026_PROMO_PERCENT_OFF,
  isRhyze2026PromoCode,
  isRhyze2026PromoEligibleProduct,
  isRhyze2026PromoWindow,
  normalizeRhyzePromoCode,
  rhyze2026PromoDiscountCents,
} from '@/lib/domain/memberships/rhyze-2026-promo';
import { parseMembershipChangeRequest } from '@/lib/domain/memberships/change-request';
import { queueEmail } from '@/lib/notifications/email-queue';
import { membershipWaiverDestination } from '@/lib/domain/waivers/acceptance';
import { parseTrialPolicyConsent } from '@/lib/domain/memberships/trial-policy-consent';

export async function requestMembershipChangeAction(formData: FormData) {
  const user = await requireArea('member');
  let request: ReturnType<typeof parseMembershipChangeRequest>;
  try {
    request = parseMembershipChangeRequest({
      membershipId: String(formData.get('membershipId') || ''),
      type: String(formData.get('type') || ''),
      requestedProductId: String(formData.get('requestedProductId') || ''),
      memberNote: String(formData.get('memberNote') || ''),
    });
  } catch {
    redirect('/member/membership?result=request-invalid');
  }

  const membership = await prisma.membership.findFirst({
    where: {
      id: request.membershipId,
      userId: user.id,
      status: { in: ['ACTIVE', 'TRIALING', 'PAUSED', 'PAST_DUE'] },
    },
    select: { id: true, product: { select: { name: true } } },
  });
  if (!membership) redirect('/member/membership?result=request-invalid');

  if (request.requestedProductId) {
    const product = await prisma.product.findFirst({
      where: {
        id: request.requestedProductId,
        isActive: true,
        billingInterval: { in: ['MONTHLY', 'YEARLY'] },
      },
      select: { id: true },
    });
    if (!product) redirect('/member/membership?result=request-invalid');
  }

  const existing = await prisma.membershipChangeRequest.findFirst({
    where: { membershipId: membership.id, status: 'PENDING' },
    select: { id: true },
  });
  if (existing) redirect('/member/membership?result=request-pending');

  await prisma.$transaction(async (tx) => {
    const created = await tx.membershipChangeRequest.create({
      data: {
        userId: user.id,
        membershipId: membership.id,
        type: request.type,
        requestedProductId: request.requestedProductId,
        memberNote: request.memberNote,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'membership.change-requested',
        entityType: 'MembershipChangeRequest',
        entityId: created.id,
        after: { type: request.type, requestedProductId: request.requestedProductId },
      },
    });
    await queueEmail(tx, {
      userId: user.id,
      to: user.email,
      subject: 'We received your membership request',
      template: 'MEMBERSHIP_CHANGE_REQUEST_RECEIVED',
      payload: {
        name: user.name || 'Rhyzer',
        requestType: request.type.toLowerCase(),
        planName: membership.product.name,
        membershipUrl: '/member/membership',
      },
      dedupeKey: `membership-change-request-received:${created.id}`,
    });
  });
  revalidatePath('/member');
  revalidatePath('/member/profile');
  revalidatePath('/member/membership');
  redirect('/member/membership?result=requested');
}

export async function startCheckoutAction(formData: FormData) {
  const user = await requireArea('member');
  const productId = String(formData.get('productId') || '');
  const privatePlan = String(formData.get('privatePlan') || '');
  const referralCodeInput = normalizeRhyzePromoCode(String(formData.get('referralCode') || ''));
  const usesRhyze2026Promo = isRhyze2026PromoCode(referralCodeInput);
  const [product, customer] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, isActive: true } }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        stripeCustomerId: true,
        memberships: {
          where: { status: { in: ['ACTIVE', 'TRIALING', 'PAUSED', 'PAST_DUE'] } },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ]);
  const productIsAvailable = product && (
    isProductAvailable(product) ||
    (
      !product.isPublic &&
      canAccessPrivateMembership(product.slug, privatePlan) &&
      isProductActiveInWindow(product)
    )
  );
  if (!product || !productIsAvailable) {
    redirect('/member/membership?result=unavailable');
  }

  const activeWaiver = await prisma.waiverVersion.findFirst({
    where: { isActive: true, requiresSign: true },
    select: { id: true },
    orderBy: { effectiveAt: 'desc' },
  });
  const waiverAcceptance = activeWaiver
    ? await prisma.waiverAcceptance.findUnique({
        where: {
          waiverVersionId_userId: {
            waiverVersionId: activeWaiver.id,
            userId: user.id,
          },
        },
        select: { id: true },
      })
    : null;
  if (!activeWaiver || !waiverAcceptance) {
    redirect(membershipWaiverDestination());
  }

  if (product.kind === 'INTRO_TRIAL') {
    try {
      parseTrialPolicyConsent(formData.get('trialPolicyAccepted'));
    } catch {
      redirect('/member/membership?result=trial-policy');
    }
    const previousTrial = await prisma.membership.findFirst({
      where: { userId: user.id, product: { kind: 'INTRO_TRIAL' } },
      select: { id: true },
    });
    if (previousTrial) {
      redirect('/member/membership?result=trial-ineligible');
    }
  }
  if (!stripeIsConfigured() || !product.stripePriceId) redirect('/member/membership?result=stripe');

  const referralEligible = isReferralEligibleProduct(product.kind);
  if (usesRhyze2026Promo) {
    if (!isRhyze2026PromoWindow()) redirect('/member/membership?result=rhyze2026-expired');
    if (!isRhyze2026PromoEligibleProduct(product)) redirect('/member/membership?result=rhyze2026-ineligible');
    if (customer?.memberships?.length) redirect('/member/membership?result=rhyze2026-current-member');
  }
  const [redeemedDiscount, previousDiscountedPurchase] = referralCodeInput
    ? await Promise.all([
        prisma.discountRedemption.findUnique({ where: { userId: user.id }, select: { id: true } }),
        prisma.purchase.findFirst({
          where: {
            userId: user.id,
            discountCents: { gt: 0 },
            status: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
          },
          select: { id: true },
        }),
      ])
    : [null, null];
  if (redeemedDiscount || previousDiscountedPurchase) redirect('/member/membership?result=referral-used');
  if (referralCodeInput && !usesRhyze2026Promo && !referralEligible) {
    redirect('/member/membership?result=referral-ineligible');
  }
  const referral = referralCodeInput && !usesRhyze2026Promo
    ? await prisma.referralCode.findFirst({
        where: {
          code: referralCodeInput,
          isActive: true,
          instructorId: { not: user.id },
        },
      })
    : null;
  if (referralCodeInput && !usesRhyze2026Promo && !referral) {
    redirect('/member/membership?result=referral-invalid');
  }
  const attribution = referral
    ? await prisma.referralAttribution.upsert({
        where: { referredUserId: user.id },
        update: { referralCodeId: referral.id },
        create: { referredUserId: user.id, referralCodeId: referral.id },
      })
    : null;
  const discountCents = usesRhyze2026Promo
    ? rhyze2026PromoDiscountCents(product)
    : referral && referralEligible
      ? referralDiscountCents(product.priceCents)
      : 0;
  const trialPolicyConsent = product.kind === 'INTRO_TRIAL'
    ? parseTrialPolicyConsent(formData.get('trialPolicyAccepted'))
    : null;
  const purchase = await prisma.purchase.create({
    data: {
      userId: user.id,
      productId: product.id,
      amountCents: product.priceCents - discountCents,
      discountCents,
      ...(trialPolicyConsent || {}),
    },
  });
  const stripe = getStripe();
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
  let checkout;
  try {
    const coupon = usesRhyze2026Promo
      ? await stripe.coupons.create(
          {
            percent_off: RHYZE_2026_PROMO_PERCENT_OFF,
            duration: 'repeating',
            duration_in_months: RHYZE_2026_PROMO_DURATION_MONTHS,
            name: 'RHYZE2026 20% off 2 months',
          },
          { idempotencyKey: `rhyze2026-coupon-${purchase.id}` },
        )
      : discountCents
        ? await stripe.coupons.create(
            { amount_off: discountCents, currency: 'usd', duration: 'once', name: 'Rhyze referral welcome discount' },
            { idempotencyKey: `referral-coupon-${purchase.id}` },
          )
        : null;
    checkout = await stripe.checkout.sessions.create({
      mode: product.billingInterval === 'ONE_TIME' ? 'payment' : 'subscription',
      ...buildCheckoutCustomerParameters({
        customerId: customer?.stripeCustomerId || null,
        email: user.email,
        mode: product.billingInterval === 'ONE_TIME' ? 'payment' : 'subscription',
      }),
      line_items: [{ price: product.stripePriceId!, quantity: 1 }],
      billing_address_collection: 'required',
      payment_intent_data: product.billingInterval === 'ONE_TIME'
        ? {
            setup_future_usage: 'off_session',
            metadata: {
              purchaseId: purchase.id,
              productId: product.id,
              userId: user.id,
              customerName: user.name || '',
              customerEmail: user.email,
            },
          }
        : undefined,
      client_reference_id: purchase.id,
      metadata: {
        purchaseId: purchase.id,
        productId: product.id,
        userId: user.id,
        referralCodeId: attribution?.referralCodeId || '',
        customerName: user.name || '',
        customerEmail: user.email,
      },
      subscription_data: product.billingInterval === 'ONE_TIME'
        ? undefined
        : buildSubscriptionData({
            purchaseId: purchase.id,
            productId: product.id,
            userId: user.id,
          }),
      discounts: coupon ? [{ coupon: coupon.id }] : undefined,
      success_url: product.kind === 'INTRO_TRIAL'
        ? `${origin}/api/checkout/membership/success?session_id={CHECKOUT_SESSION_ID}`
        : `${origin}/member/membership?result=success`,
      cancel_url: `${origin}/member/membership?result=cancelled`,
    }, { idempotencyKey: `checkout-${purchase.id}` });
  } catch (error) {
    console.error('Stripe membership checkout failed', {
      purchaseId: purchase.id,
      productId: product.id,
      message: error instanceof Error ? error.message : 'Unknown Stripe error',
    });
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: 'FAILED', failedAt: new Date() },
    });
    redirect('/member/membership?result=checkout-error');
  }
  if (!checkout.url) {
    await prisma.purchase.update({
      where: { id: purchase.id },
      data: { status: 'FAILED', failedAt: new Date() },
    });
    redirect('/member/membership?result=checkout-error');
  }
  await prisma.purchase.update({ where: { id: purchase.id }, data: { stripeCheckoutSessionId: checkout.id } });
  redirect(checkout.url);
}
