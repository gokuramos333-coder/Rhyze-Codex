'use server';

import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { buildPortalSessionParameters } from '@/lib/payments/checkout-config';
import {
  getStripe,
  stripeAccountMode,
  stripeConfiguration,
} from '@/lib/payments/stripe';
import { inspectPortalConfiguration } from '@/lib/payments/portal-readiness';

export async function openStripePortalAction() {
  const user = await requireArea('member');
  const customer = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true },
  });
  if (!stripeConfiguration().portal)
    redirect('/member/billing?result=stripe-not-connected');
  if (!customer?.stripeCustomerId)
    redirect('/member/billing?result=no-stripe-customer');

  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
  const stripe = getStripe();
  const portal = await inspectPortalConfiguration(
    stripe.billingPortal.configurations,
    process.env.STRIPE_PORTAL_CONFIGURATION_ID,
    stripeAccountMode() === 'live',
  );
  if (!portal.ready) {
    console.error('billing_portal_unavailable', {
      stage: 'configuration',
      reason: portal.reason,
    });
    redirect('/member/billing?result=portal-unavailable');
  }
  let url: string;
  try {
    const session = await stripe.billingPortal.sessions.create(
      buildPortalSessionParameters({
        customerId: customer.stripeCustomerId,
        returnUrl: `${origin}/member/billing`,
        configurationId: portal.id,
      }),
      { timeout: 10000, maxNetworkRetries: 0 },
    );
    url = session.url;
  } catch {
    console.error('billing_portal_unavailable', { stage: 'session' });
    redirect('/member/billing?result=portal-unavailable');
  }
  // Next.js redirects throw; do not catch a successful redirect as a provider failure.
  redirect(url);
}
