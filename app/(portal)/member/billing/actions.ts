'use server';

import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { buildPortalSessionParameters } from '@/lib/payments/checkout-config';
import { getStripe, stripeConfiguration } from '@/lib/payments/stripe';

export async function openStripePortalAction() {
  const user = await requireArea('member');
  const customer = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true },
  });
  if (!stripeConfiguration().portal) redirect('/member/billing?result=stripe-not-connected');
  if (!customer?.stripeCustomerId) redirect('/member/billing?result=no-stripe-customer');

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
  const session = await getStripe().billingPortal.sessions.create(
    buildPortalSessionParameters({
      customerId: customer.stripeCustomerId,
      returnUrl: `${origin}/member/billing`,
      configurationId: process.env.STRIPE_PORTAL_CONFIGURATION_ID,
    }),
  );
  redirect(session.url);
}
