import type { Prisma, PrismaClient } from '@prisma/client';

const INTRO_TRIAL_DAYS = 7;

type Tx = Prisma.TransactionClient | PrismaClient;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function linkStripePaymentRecordToMember(
  tx: Tx,
  input: {
    paymentRecordId: string;
    memberEmail: string;
    actorId?: string | null;
    grantIntroTrial?: boolean;
    activateAt?: Date | null;
    note?: string | null;
  },
) {
  const member = await tx.user.findFirst({
    where: { email: { equals: input.memberEmail.trim(), mode: 'insensitive' } },
    select: { id: true, name: true, email: true, stripeCustomerId: true },
  });
  if (!member) return { ok: false as const, reason: 'member-not-found' as const };

  const payment = await tx.paymentRecord.findUnique({
    where: { id: input.paymentRecordId },
  });
  if (!payment || payment.status === 'FAILED' || payment.status === 'DISPUTED') {
    return { ok: false as const, reason: 'payment-unavailable' as const };
  }
  if (payment.userId && payment.userId !== member.id) {
    return { ok: false as const, reason: 'payment-linked-other-member' as const };
  }

  let purchaseId = payment.purchaseId;
  let membershipId = payment.membershipId;
  let creditAccountId: string | null = null;

  if (input.grantIntroTrial) {
    if (payment.amountCents !== 700) {
      return { ok: false as const, reason: 'intro-payment-amount' as const };
    }
    const product = await tx.product.findFirst({
      where: { kind: 'INTRO_TRIAL', priceCents: 700, isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
    if (!product) return { ok: false as const, reason: 'intro-product-not-found' as const };

    const paidAt = payment.occurredAt || new Date();
    const activateAt = input.activateAt ?? null;
    const currentPeriodEnd = activateAt ? addDays(activateAt, INTRO_TRIAL_DAYS) : null;
    const existingPurchase = payment.stripePaymentIntentId
      ? await tx.purchase.findUnique({ where: { stripePaymentIntentId: payment.stripePaymentIntentId } })
      : null;
    const purchase = existingPurchase
      ? await tx.purchase.update({
          where: { id: existingPurchase.id },
          data: {
            userId: member.id,
            productId: product.id,
            status: 'PAID',
            amountCents: payment.amountCents,
            currency: payment.currency,
            stripeCheckoutSessionId: payment.stripeCheckoutSessionId,
            paidAt,
          },
        })
      : await tx.purchase.create({
          data: {
            userId: member.id,
            productId: product.id,
            status: 'PAID',
            amountCents: payment.amountCents,
            currency: payment.currency,
            stripeCheckoutSessionId: payment.stripeCheckoutSessionId,
            stripePaymentIntentId: payment.stripePaymentIntentId,
            paidAt,
          },
        });
    purchaseId = purchase.id;

    const membership = await tx.membership.upsert({
      where: { purchaseId: purchase.id },
      update: {
        userId: member.id,
        productId: product.id,
        status: 'TRIALING',
        currentPeriodStart: activateAt ?? paidAt,
        currentPeriodEnd,
        activatedAt: activateAt,
      },
      create: {
        userId: member.id,
        productId: product.id,
        purchaseId: purchase.id,
        status: 'TRIALING',
        currentPeriodStart: activateAt ?? paidAt,
        currentPeriodEnd,
        activatedAt: activateAt,
      },
    });
    membershipId = membership.id;

    const creditAccount = await tx.creditAccount.upsert({
      where: { sourcePurchaseId: purchase.id },
      update: {
        userId: member.id,
        label: 'Intro trial — unlimited standard class credits for 7 days',
        isUnlimited: true,
        validFrom: activateAt ?? paidAt,
        validUntil: currentPeriodEnd,
      },
      create: {
        userId: member.id,
        sourcePurchaseId: purchase.id,
        label: 'Intro trial — unlimited standard class credits for 7 days',
        isUnlimited: true,
        validFrom: activateAt ?? paidAt,
        validUntil: currentPeriodEnd,
      },
    });
    creditAccountId = creditAccount.id;
  }

  await tx.paymentRecord.update({
    where: { id: payment.id },
    data: {
      userId: member.id,
      purchaseId,
      membershipId,
      customerName: member.name || payment.customerName,
      customerEmail: member.email,
      stripeCustomerId: payment.stripeCustomerId || member.stripeCustomerId,
    },
  });

  await tx.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      action: input.grantIntroTrial ? 'payment.link-intro-trial' : 'payment.link-member',
      entityType: 'PaymentRecord',
      entityId: payment.id,
      before: { userId: payment.userId, purchaseId: payment.purchaseId, membershipId: payment.membershipId },
      after: {
        userId: member.id,
        memberEmail: member.email,
        purchaseId,
        membershipId,
        creditAccountId,
        activateAt: input.activateAt?.toISOString() ?? null,
        note: input.note ?? null,
      },
    },
  });

  return { ok: true as const, memberId: member.id, purchaseId, membershipId, creditAccountId };
}
