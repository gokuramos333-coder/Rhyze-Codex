import { NextResponse } from 'next/server';
import { isTrustedAdminOrigin } from '@/lib/auth/request-origin';
import { revalidatePath } from 'next/cache';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getStripe, stripeAccountMode, stripeIsConfigured } from '@/lib/payments/stripe';
import { linkStripeEventPayment, StripeEventPaymentLinkError, stripeEventPaymentLinkSchema } from '@/lib/admin/stripe-event-payment-linking';

export async function POST(request: Request) {
  // Explicit Origin protection: this mutation is an owner-session API, not a webhook.
  if (!isTrustedAdminOrigin(request)) {
    return NextResponse.json({ error: 'Same-origin owner request required.' }, { status: 403 });
  }
  const owner = await requireApprovedOwner();
  if (!stripeIsConfigured() || stripeAccountMode() !== 'live') return NextResponse.json({ error: 'Live Stripe is required.' }, { status: 503 });
  const parsed = stripeEventPaymentLinkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Provide the exact payment, member, event, amount, currency, attendance choice, and reconciliation reason.' }, { status: 400 });
  try {
    const result = await linkStripeEventPayment(prisma, getStripe(), { ...parsed.data, actorId: owner.id });
    for (const path of ['/admin/payments', '/admin/events', '/admin/activity', '/admin', '/member/bookings', '/member/billing', `/admin/members/${parsed.data.userId}`, `/admin/schedule/${parsed.data.occurrenceId}/roster`]) revalidatePath(path);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof StripeEventPaymentLinkError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error('External Stripe event reconciliation failed', { paymentIntentId: parsed.data.paymentIntentId, error: error instanceof Error ? error.message : 'Unknown error' });
    return NextResponse.json({ error: 'Reconciliation failed. No new charge was attempted. Review the payment before retrying.' }, { status: 502 });
  }
}
