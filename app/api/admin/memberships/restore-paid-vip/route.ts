import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireApprovedOwner } from '@/lib/auth/session';
import { isTrustedAdminOrigin } from '@/lib/auth/request-origin';
import { prisma } from '@/lib/db/prisma';
import { getStripe, stripeAccountMode } from '@/lib/payments/stripe';
import { restoreInitialVipEntitlement } from '@/lib/payments/restore-initial-vip-entitlement';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';

const schema = z.object({ membershipId: z.string().min(1).max(200), invoiceId: z.string().regex(/^in_[A-Za-z0-9]+$/), dryRun: z.boolean(), reason: z.string().trim().min(10).max(240) }).strict();
const idOf = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id;

// Explicit owner repair, never a public diagnostic or automatic financial replay.
// Provider operations below are retrievals only. Financial records remain unchanged.
export async function POST(request: Request) {
  if (!isTrustedAdminOrigin(request)) return NextResponse.json({ error: 'Same-origin owner request required.' }, { status: 403 });
  const owner = await requireApprovedOwner();
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Membership, invoice, explicit dryRun and reason required.' }, { status: 400 });
  if (stripeAccountMode() !== 'live') return NextResponse.json({ error: 'Live Stripe required.' }, { status: 503 });
  try {
    const stripe = getStripe();
    const options = { timeout: 10000, maxNetworkRetries: 0 };
    const account = await stripe.accounts.retrieve(options);
    if (account.id !== 'acct_1Tu0UqRIYui0I7dP') throw Error('Account mismatch');
    const invoice = await stripe.invoices.retrieve(parsed.data.invoiceId, { expand: ['payments.data.payment'] }, options);
    const details = invoice.parent?.subscription_details;
    const subscriptionId = idOf(details?.subscription);
    const purchaseId = details?.metadata?.purchaseId;
    const customerId = idOf(invoice.customer);
    const line = invoice.lines.data.length === 1 ? invoice.lines.data[0] : null;
    const priceId = idOf(line?.pricing?.price_details?.price);
    const paid = invoice.payments?.data.filter(p => p.status === 'paid');
    const paymentIntentId = paid?.length === 1 && paid[0].payment.type === 'payment_intent' ? idOf(paid[0].payment.payment_intent) : null;
    if (invoice.id !== parsed.data.invoiceId || invoice.livemode !== true || invoice.status !== 'paid' ||
        invoice.billing_reason !== 'subscription_create' || !subscriptionId || !purchaseId || !customerId ||
        !paymentIntentId || !priceId || line?.parent?.subscription_item_details?.proration !== false || invoice.payments?.has_more || invoice.lines.has_more || !line ||
        idOf(line.parent?.subscription_item_details?.subscription) !== subscriptionId ||
        !invoice.status_transitions.paid_at || invoice.amount_paid <= 0 || invoice.amount_remaining !== 0 ||
        invoice.amount_due !== invoice.amount_paid || invoice.currency !== 'usd') throw Error('Invoice proof incomplete');
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {}, options);
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] }, options);
    const charge = typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    if (subscription.id !== subscriptionId || subscription.livemode !== true || subscription.status !== 'active' ||
        idOf(subscription.customer) !== customerId || idOf(subscription.latest_invoice) !== invoice.id ||
        subscription.metadata.purchaseId !== purchaseId || intent.id !== paymentIntentId || intent.livemode !== true ||
        intent.status !== 'succeeded' || idOf(intent.customer) !== customerId || intent.currency !== invoice.currency ||
        intent.amount_received !== invoice.amount_paid || !charge || charge.livemode !== true ||
        !charge.paid || !charge.captured || charge.disputed || charge.refunded || charge.amount_refunded !== 0 ||
        charge.amount_captured !== invoice.amount_paid || idOf(charge.payment_intent) !== intent.id) throw Error('Settlement proof incomplete');
    const result = await retrySerializableTransaction(() => prisma.$transaction(tx => restoreInitialVipEntitlement(tx, {
      ...parsed.data, actorId: owner.id, now: new Date(), proof: {
        invoiceId: invoice.id, subscriptionId, purchaseId, customerId, paymentIntentId, priceId,
        amountCents: invoice.amount_paid, currency: invoice.currency,
        paidAt: new Date(invoice.status_transitions.paid_at! * 1000),
        periodStart: new Date(line.period.start * 1000), periodEnd: new Date(line.period.end * 1000),
      },
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10000 }));
    if (!parsed.data.dryRun) for (const path of ['/member','/member/bookings','/admin/members']) revalidatePath(path, 'layout');
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: 'Recovery refused or verification unavailable. Review current provider and membership state before retrying; no charge or financial replay was requested.' }, { status: 409 });
  }
}
