import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { fulfillMembershipCheckoutReturn } from '@/lib/payments/membership-checkout-return';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { checkoutPlanValue } from '@/lib/payments/checkout-attribution';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function membershipPage(
  request: Request,
  result: string,
  attribution?: { plan: string; sessionId: string },
) {
  const destination = new URL('/member/membership', request.url);
  destination.searchParams.set('result', result);
  if (attribution) {
    destination.searchParams.set('plan', attribution.plan);
    destination.searchParams.set('session_id', attribution.sessionId);
  }
  return destination;
}

function checkoutReturnEvent(checkoutSession: Stripe.Checkout.Session) {
  return {
    id: `checkout-return-${checkoutSession.id}`,
    type: 'checkout.session.completed',
    created: checkoutSession.created,
    data: { object: checkoutSession },
  } as Stripe.Event;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    const callbackUrl = new URL(request.url).pathname + new URL(request.url).search;
    return NextResponse.redirect(
      new URL(`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`, request.url),
    );
  }
  if (!stripeIsConfigured()) {
    return NextResponse.redirect(membershipPage(request, 'stripe'));
  }

  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId) {
    return NextResponse.redirect(membershipPage(request, 'checkout-error'));
  }

  try {
    let verifiedPlan: string | null = null;
    const result = await fulfillMembershipCheckoutReturn(
      { sessionId, userId: session.user.id },
      {
        retrieveSession: (id) => getStripe().checkout.sessions.retrieve(id),
        findPurchase: async (purchaseId) => {
          const purchase = await prisma.purchase.findUnique({
            where: { id: purchaseId },
            select: {
              id: true,
              userId: true,
              stripeCheckoutSessionId: true,
              product: { select: { kind: true, slug: true } },
            },
          });
          verifiedPlan = purchase ? checkoutPlanValue(purchase.product.slug) : null;
          return purchase
            ? {
                id: purchase.id,
                userId: purchase.userId,
                stripeCheckoutSessionId: purchase.stripeCheckoutSessionId,
                productKind: purchase.product.kind,
              }
            : null;
        },
        fulfillSession: (checkoutSession) =>
          retrySerializableTransaction(() =>
            prisma.$transaction(
              (tx) => processStripeEvent(tx, checkoutReturnEvent(checkoutSession)),
              { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
            ),
          ),
      },
    );

    if (result === 'forbidden') {
      return NextResponse.json({ error: 'Checkout session does not belong to this member.' }, { status: 403 });
    }
    if (result === 'invalid') {
      return NextResponse.json({ error: 'Checkout session is invalid.' }, { status: 400 });
    }
    if (result === 'pending') {
      return NextResponse.redirect(membershipPage(request, 'processing'));
    }
    if (!verifiedPlan) {
      return NextResponse.redirect(membershipPage(request, 'checkout-error'));
    }

    revalidatePath('/member');
    revalidatePath('/member/membership');
    revalidatePath('/member/bookings');
    return NextResponse.redirect(
      membershipPage(request, 'success', { plan: verifiedPlan, sessionId }),
    );
  } catch (error) {
    console.error('Stripe checkout return fulfillment failed', {
      sessionId,
      userId: session.user.id,
      message: error instanceof Error ? error.message : 'Unknown Stripe error',
    });
    return NextResponse.redirect(membershipPage(request, 'processing'));
  }
}
