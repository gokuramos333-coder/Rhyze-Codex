import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { buildCheckoutCustomerParameters, buildCheckoutWalletParameters } from '@/lib/payments/checkout-config';
import { classTicketBinding } from '@/lib/payments/class-ticket';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';

type Db = PrismaClient | Prisma.TransactionClient;
export class ClassTicketCheckoutError extends Error {
  constructor(readonly code: 'unavailable' | 'waiver' | 'full' | 'already-booked' | 'already-paid' | 'review', message: string) { super(message); }
}
export async function classTicketOffer(db: Db, occurrenceId: string, now = new Date()) {
  const [occurrence, product] = await Promise.all([
    db.classOccurrence.findUnique({ where: { id: occurrenceId }, include: { template: true } }),
    db.product.findFirst({ where: { kind: 'DROP_IN', billingInterval: 'ONE_TIME', isActive: true, isPublic: true, includedCredits: 1, isUnlimited: false }, orderBy: { displayOrder: 'asc' } }),
  ]);
  if (!occurrence || occurrence.template.isEvent || occurrence.template.isActive === false || occurrence.status !== 'SCHEDULED' || occurrence.startAt <= now ||
      !product || !Number.isSafeInteger(occurrence.priceCents) || !occurrence.priceCents || occurrence.priceCents <= 0 || occurrence.priceCents === product.priceCents) {
    throw new ClassTicketCheckoutError('unavailable', 'This class does not have an available occurrence-specific ticket.');
  }
  return { occurrence, product, amountCents: occurrence.priceCents };
}
export function classTicketPurchaseId(userId: string, occurrenceId: string) {
  return `class-ticket-${createHash('sha256').update(`${userId}:${occurrenceId}`).digest('hex').slice(0, 32)}`;
}

export async function startClassTicketCheckout(db: PrismaClient, stripe: Stripe, input: { userId: string; occurrenceId: string; origin: string }, now = new Date()) {
  const purchaseId = classTicketPurchaseId(input.userId, input.occurrenceId);
  const origin = input.origin.replace(/\/$/, '');
  const successUrl = (sessionId: string) => `${origin}/api/checkout/membership/success?session_id=${encodeURIComponent(sessionId)}`;
  type Attempt = { parameters: Stripe.Checkout.SessionCreateParams; attempt: number; preparedAt: string };
  const prepare = (expiredSessionId?: string) => retrySerializableTransaction(() => db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${purchaseId}))`;
    const existing = await tx.purchase.findUnique({ where: { id: purchaseId } });
    if (existing) {
      if (existing.userId !== input.userId) throw new ClassTicketCheckoutError('review', 'This purchase needs studio review.');
      if (existing.status === 'PAID') return { paid: true as const, sessionId: existing.stripeCheckoutSessionId, checkout: null };
      if (existing.status !== 'PENDING') throw new ClassTicketCheckoutError('review', 'This ticket has prior payment history. Contact the studio before purchasing again.');
      const policy = existing.policyAcceptance as Record<string, unknown> | null;
      const stored = policy?.classTicketCheckout as Attempt | undefined;
      if (!stored?.parameters || !Number.isInteger(stored.attempt)) throw new ClassTicketCheckoutError('review', 'The pending payment needs studio review.');
      if (!expiredSessionId || existing.stripeCheckoutSessionId !== expiredSessionId) {
        if (!existing.stripeCheckoutSessionId && now.getTime() - new Date(stored.preparedAt).getTime() >= 23 * 60 * 60 * 1000) throw new ClassTicketCheckoutError('review', 'An older payment attempt needs studio review before retrying.');
        return { paid: false as const, sessionId: existing.stripeCheckoutSessionId, checkout: stored };
      }
    }
    const { occurrence, product, amountCents } = await classTicketOffer(tx, input.occurrenceId, now);
    const previousTicket = classTicketBinding(existing?.policyAcceptance);
    if (previousTicket && (previousTicket.amountCents !== amountCents || previousTicket.startAt !== occurrence.startAt.toISOString() || previousTicket.endAt !== occurrence.endAt.toISOString())) throw new ClassTicketCheckoutError('review', 'The class terms changed after your earlier payment attempt. Contact the studio before paying.');
    const user = await tx.user.findUnique({ where: { id: input.userId } });
    if (!user || user.status !== 'ACTIVE') throw new ClassTicketCheckoutError('unavailable', 'Sign in with an active account.');
    const waiver = await tx.waiverVersion.findFirst({ where: { isActive: true, requiresSign: true }, orderBy: { effectiveAt: 'desc' }, select: { id: true } });
    const acceptance = waiver ? await tx.waiverAcceptance.findUnique({ where: { waiverVersionId_userId: { waiverVersionId: waiver.id, userId: user.id } }, select: { id: true } }) : null;
    if (!acceptance) throw new ClassTicketCheckoutError('waiver', 'Accept the current studio waiver before paying.');
    const [booking, occupied, paid] = await Promise.all([
      tx.booking.findUnique({ where: { occurrenceId_userId: { occurrenceId: occurrence.id, userId: user.id } }, select: { status: true } }),
      tx.booking.count({ where: { occurrenceId: occurrence.id, status: { in: ['CONFIRMED', 'ATTENDED'] } } }),
      tx.purchase.findFirst({ where: { userId: user.id, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] }, policyAcceptance: { path: ['classTicket', 'occurrenceId'], equals: occurrence.id } }, select: { id: true } }),
    ]);
    if (booking && ['CONFIRMED', 'ATTENDED'].includes(booking.status)) throw new ClassTicketCheckoutError('already-booked', 'You are already booked for this class.');
    if (paid) throw new ClassTicketCheckoutError('already-paid', 'You already purchased this class ticket.');
    if (occupied + occurrence.historicalSignupCount >= occurrence.capacity) throw new ClassTicketCheckoutError('full', 'This class is full.');
    const binding = { occurrenceId: occurrence.id, name: occurrence.titleOverride || occurrence.template.name, startAt: occurrence.startAt.toISOString(), endAt: occurrence.endAt.toISOString(), amountCents };
    const parameters: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment', ...buildCheckoutWalletParameters(),
      ...buildCheckoutCustomerParameters({ customerId: user.stripeCustomerId, email: user.email, mode: 'payment' }),
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: amountCents, product_data: { name: `${binding.name} — ${occurrence.startAt.toLocaleDateString('en-US', { timeZone: occurrence.timezone || 'America/New_York' })}`, description: 'One class ticket for the selected date only. Not transferable to another class.' } } }],
      billing_address_collection: 'required', client_reference_id: purchaseId,
      metadata: { purchaseId, productId: product.id, userId: user.id, occurrenceId: occurrence.id, purchaseType: 'CLASS_TICKET', customerName: user.name || '', customerEmail: user.email },
      payment_intent_data: { setup_future_usage: 'off_session', metadata: { purchaseId, userId: user.id, occurrenceId: occurrence.id, purchaseType: 'CLASS_TICKET' } },
      success_url: `${origin}/api/checkout/membership/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/member/class-checkout?occurrence=${encodeURIComponent(occurrence.id)}&result=cancelled`,
    };
    // Persist the exact request before talking to Stripe. Retries cannot create a
    // second purchase or change the request under the original idempotency key.
    const priorPolicy = existing?.policyAcceptance as Record<string, unknown> | null;
    const priorAttempt = priorPolicy?.classTicketCheckout as Attempt | undefined;
    const checkout: Attempt = { parameters, attempt: (priorAttempt?.attempt ?? 0) + 1, preparedAt: now.toISOString() };
    const policyAcceptance = JSON.parse(JSON.stringify({ classTicket: binding, classTicketCheckout: checkout })) as Prisma.InputJsonValue;
    const data = { userId: user.id, productId: product.id, amountCents, policyAcceptedAt: now, policyAcceptance, stripeCheckoutSessionId: null };
    if (existing) await tx.purchase.update({ where: { id: purchaseId }, data });
    else await tx.purchase.create({ data: { id: purchaseId, ...data } });
    return { paid: false as const, sessionId: null, checkout };
  }, { isolationLevel: 'Serializable' }));

  let prepared = await prepare();
  if (prepared.paid) {
    if (prepared.sessionId) return successUrl(prepared.sessionId);
    throw new ClassTicketCheckoutError('review', 'Your paid ticket needs studio review.');
  }
  if (prepared.sessionId) {
    const session = await stripe.checkout.sessions.retrieve(prepared.sessionId);
    if (session.status === 'complete' && session.payment_status === 'paid') return successUrl(session.id);
    if (session.status === 'open' && session.url) return session.url;
    if (session.status !== 'expired') throw new ClassTicketCheckoutError('review', 'Your pending payment needs studio review.');
    prepared = await prepare(session.id);
    if (prepared.paid) {
      if (prepared.sessionId) return successUrl(prepared.sessionId);
      throw new ClassTicketCheckoutError('review', 'Your paid ticket needs studio review.');
    }
    if (prepared.sessionId) {
      const replacement = await stripe.checkout.sessions.retrieve(prepared.sessionId);
      if (replacement.status === 'open' && replacement.url) return replacement.url;
      throw new ClassTicketCheckoutError('review', 'Your pending payment needs studio review.');
    }
  }
  // On any ambiguous provider failure keep the persisted PENDING attempt. Stripe
  // gets the same request/key next time; only verified expiry rotates the key.
  const checkout = await stripe.checkout.sessions.create(prepared.checkout.parameters, { idempotencyKey: `${purchaseId}:checkout:${prepared.checkout.attempt}` });
  if (!checkout.url) throw new ClassTicketCheckoutError('review', 'Stripe did not return a Checkout URL.');
  await db.purchase.update({ where: { id: purchaseId }, data: { stripeCheckoutSessionId: checkout.id } });
  return checkout.url;
}
