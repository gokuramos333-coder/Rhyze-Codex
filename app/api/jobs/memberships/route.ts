import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { vipMonthlyBenefitWindowForDate } from '@/lib/domain/credits/vip-monthly-benefits';
import { ERIKA_GIFTED_VIP } from '@/lib/domain/memberships/gifted-vip';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';

export async function POST(request: Request) {
  if (
    !process.env.JOB_SECRET ||
    request.headers.get('authorization') !== `Bearer ${process.env.JOB_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const [startingFreezes, endingFreezes] = await Promise.all([
    prisma.membershipFreeze.findMany({
      where: { cancelledAt: null, activatedAt: null, startAt: { lte: now } },
      include: { membership: true },
      orderBy: { startAt: 'asc' },
    }),
    prisma.membershipFreeze.findMany({
      where: { cancelledAt: null, activatedAt: { not: null }, resumedAt: null, endAt: { lte: now } },
      include: { membership: true },
      orderBy: { endAt: 'asc' },
    }),
  ]);
  let freezesStarted = 0;
  let freezesResumed = 0;
  const freezeErrors: string[] = [];

  for (const freeze of startingFreezes) {
    try {
      if (freeze.membership.stripeSubscriptionId) {
        if (!stripeIsConfigured()) throw new Error('Stripe is not configured');
        await getStripe().subscriptions.update(
          freeze.membership.stripeSubscriptionId,
          { pause_collection: { behavior: 'void' } },
          { idempotencyKey: `scheduled-freeze-start-${freeze.id}` },
        );
      }
      await prisma.$transaction([
        prisma.membership.update({ where: { id: freeze.membershipId }, data: { status: 'PAUSED' } }),
        prisma.membershipFreeze.update({ where: { id: freeze.id }, data: { activatedAt: now } }),
      ]);
      freezesStarted += 1;
    } catch (error) {
      freezeErrors.push(`${freeze.id}: ${error instanceof Error ? error.message : 'start failed'}`);
    }
  }

  for (const freeze of endingFreezes) {
    try {
      if (freeze.membership.stripeSubscriptionId) {
        if (!stripeIsConfigured()) throw new Error('Stripe is not configured');
        await getStripe().subscriptions.update(
          freeze.membership.stripeSubscriptionId,
          { pause_collection: '' },
          { idempotencyKey: `scheduled-freeze-end-${freeze.id}` },
        );
      }
      await prisma.$transaction([
        prisma.membership.update({ where: { id: freeze.membershipId }, data: { status: 'ACTIVE' } }),
        prisma.membershipFreeze.update({ where: { id: freeze.id }, data: { resumedAt: now } }),
      ]);
      freezesResumed += 1;
    } catch (error) {
      freezeErrors.push(`${freeze.id}: ${error instanceof Error ? error.message : 'resume failed'}`);
    }
  }

  const backfilledTrialWindows = await prisma.$executeRaw`
    WITH first_trial_class AS (
      SELECT
        booking."userId",
        MIN(occurrence."startAt") AS "firstClassAt"
      FROM "Booking" AS booking
      JOIN "ClassOccurrence" AS occurrence ON occurrence.id = booking."occurrenceId"
      JOIN "ClassTemplate" AS template ON template.id = occurrence."templateId"
      WHERE booking.status IN ('CONFIRMED', 'ATTENDED')
        AND template."isEvent" = FALSE
        AND booking."policySnapshot"->>'accessType' = 'INTRO_TRIAL'
      GROUP BY booking."userId"
    )
    UPDATE "Membership" AS membership
    SET
      "activatedAt" = COALESCE(membership."activatedAt", first_trial_class."firstClassAt"),
      "currentPeriodStart" = COALESCE(membership."activatedAt", first_trial_class."firstClassAt"),
      "currentPeriodEnd" = COALESCE(
        membership."currentPeriodEnd",
        first_trial_class."firstClassAt" + INTERVAL '7 days'
      ),
      "updatedAt" = NOW()
    FROM "Product" AS product, first_trial_class
    WHERE product.id = membership."productId"
      AND product.kind = 'INTRO_TRIAL'
      AND membership."userId" = first_trial_class."userId"
      AND membership.status IN ('TRIALING', 'ACTIVE')
      AND (membership."activatedAt" IS NULL OR membership."currentPeriodEnd" IS NULL)
  `;

  const expiredTrialCredits = await prisma.$executeRaw`
    UPDATE "CreditAccount" AS account
    SET "validUntil" = membership."currentPeriodEnd", "updatedAt" = NOW()
    FROM "Purchase" AS purchase
    JOIN "Product" AS product ON product.id = purchase."productId"
    JOIN "Membership" AS membership ON membership."purchaseId" = purchase.id
    WHERE account."sourcePurchaseId" = purchase.id
      AND product.kind = 'INTRO_TRIAL'
      AND membership."activatedAt" IS NOT NULL
      AND membership."currentPeriodEnd" <= ${now}
      AND (account."validUntil" IS NULL OR account."validUntil" > ${now})
  `;

  const expired = await prisma.membership.updateMany({
    where: {
      status: { in: ['TRIALING', 'ACTIVE'] },
      activatedAt: { not: null },
      currentPeriodEnd: { lte: now },
      product: { kind: 'INTRO_TRIAL' },
    },
    data: { status: 'EXPIRED' },
  });

  const expiredGiftedVip = await prisma.membership.updateMany({
    where: {
      status: { in: ['ACTIVE', 'TRIALING'] },
      currentPeriodEnd: { lte: now },
      product: { slug: ERIKA_GIFTED_VIP.productSlug },
    },
    data: { status: 'EXPIRED' },
  });

  const vipWindow = vipMonthlyBenefitWindowForDate(now);
  const activeVipMemberships = await prisma.membership.findMany({
    where: {
      status: 'ACTIVE',
      product: { kind: 'VIP', isUnlimited: true },
      user: { status: 'ACTIVE' },
    },
    include: { user: { select: { id: true, email: true } } },
  });
  let vipUnlimitedCreditsSynced = 0;
  let vipEventCreditsGranted = 0;
  for (const membership of activeVipMemberships) {
    const existingUnlimited = await prisma.creditAccount.findFirst({
      where: {
        userId: membership.userId,
        label: vipWindow.classCreditLabel,
        isUnlimited: true,
        validFrom: vipWindow.validFrom,
        validUntil: vipWindow.validUntil,
      },
      select: { id: true },
    });
    if (!existingUnlimited) {
      await prisma.creditAccount.create({
        data: {
          userId: membership.userId,
          label: vipWindow.classCreditLabel,
          isUnlimited: true,
          validFrom: vipWindow.validFrom,
          validUntil: vipWindow.validUntil,
        },
      });
      vipUnlimitedCreditsSynced += 1;
    }

    const existingEventCredit = await prisma.creditAccount.findFirst({
      where: {
        userId: membership.userId,
        label: vipWindow.eventCreditLabel,
        validFrom: vipWindow.validFrom,
        validUntil: vipWindow.validUntil,
      },
      select: { id: true },
    });
    if (!existingEventCredit) {
      await prisma.creditAccount.create({
        data: {
          userId: membership.userId,
          label: vipWindow.eventCreditLabel,
          validFrom: vipWindow.validFrom,
          validUntil: vipWindow.validUntil,
          entries: {
            create: {
              type: 'GRANT',
              quantity: 1,
              reason: vipWindow.eventGrantReason,
            },
          },
        },
      });
      vipEventCreditsGranted += 1;
    }
  }

  return NextResponse.json({
    backfilledTrialWindows: Number(backfilledTrialWindows),
    expiredTrials: expired.count,
    expiredTrialCredits: Number(expiredTrialCredits),
    expiredGiftedVip: expiredGiftedVip.count,
    freezesStarted,
    freezesResumed,
    freezeErrors,
    vipBenefitMonth: vipWindow.key,
    vipMembersChecked: activeVipMemberships.length,
    vipUnlimitedCreditsSynced,
    vipEventCreditsGranted,
  });
}
