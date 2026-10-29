import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isTrustedAdminOrigin } from '@/lib/auth/request-origin';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getStripe, stripeAccountMode, stripeIsConfigured } from '@/lib/payments/stripe';
import { eventReviewSchema, EventReviewError, reconcileEventReview } from '@/lib/admin/reconcile-event-review';

export async function POST(request: Request) {
  if (!isTrustedAdminOrigin(request)) return NextResponse.json({ error: 'Same-origin owner request required.' }, { status: 403 });
  const owner = await requireApprovedOwner();
  const input = eventReviewSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: 'Exact order, booking versions and explicit confirmation required.' }, { status: 400 });
  if (!stripeIsConfigured() || stripeAccountMode() !== 'live') return NextResponse.json({ error: 'Live Stripe required.' }, { status: 503 });
  try {
    const result = await reconcileEventReview(prisma, getStripe(), { ...input.data, actorId: owner.id });
    if (!input.data.dryRun) for (const path of ['/admin', '/admin/events', '/admin/payments', '/admin/activity']) revalidatePath(path);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof EventReviewError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: 'Verification unavailable. Recheck before retrying; no financial action was attempted.' }, { status: 502 });
  }
}
