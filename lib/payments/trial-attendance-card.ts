import { prisma } from '@/lib/db/prisma';
import { bookingAccessType } from '@/lib/domain/bookings/booking-access';
import { getStripe } from '@/lib/payments/stripe';

export type TrialPaymentSource = { isTrial: true; customerId?: string; paymentMethodId?: string } | null;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}
function id(value: string | { id: string } | null) {
  return typeof value === 'string' ? value : value?.id ?? null;
}

/** Resolve provenance, never the customer's current default or an arbitrary card. */
export async function resolveTrialAttendancePaymentSource(input: {
  bookingId: string; userId: string;
}): Promise<TrialPaymentSource> {
  const booking = await prisma.booking.findFirst({
    where: { id: input.bookingId, userId: input.userId },
    select: { source: true, policySnapshot: true, user: { select: { memberships: {
      where: { status: { in: ['ACTIVE', 'TRIALING'] } }, select: { product: { select: { kind: true } } },
    } } } },
  });
  if (!booking) throw new Error('Attendance fee booking unavailable.');
  const snapshot = object(booking.policySnapshot);
  const accountId = typeof snapshot.creditAccountId === 'string' ? snapshot.creditAccountId : null;
  const account = accountId ? await prisma.creditAccount.findFirst({
    where: { id: accountId, userId: input.userId },
    select: { sourcePurchase: { include: { product: { select: { kind: true } } } } },
  }) : null;
  const access = bookingAccessType({
    policySnapshot: booking.policySnapshot, bookingSource: booking.source,
    reservedProductKind: account?.sourcePurchase?.product.kind ?? null,
    activeProductKinds: booking.user.memberships.map(m => m.product.kind),
  });
  if (access !== 'INTRO_TRIAL') return null;
  let purchase = account?.sourcePurchase;
  if (!accountId) {
    // Legacy bookings may lack a snapshot. Only an unambiguous owned trial qualifies.
    const candidates = await prisma.purchase.findMany({
      where: { userId: input.userId, product: { kind: 'INTRO_TRIAL' }, status: 'PAID' },
      include: { product: { select: { kind: true } } }, take: 2,
    });
    if (candidates.length === 1) purchase = candidates[0];
  }
  if (!purchase || purchase.userId !== input.userId || purchase.product.kind !== 'INTRO_TRIAL' ||
      purchase.status !== 'PAID' || purchase.refundedAmountCents !== 0 || !purchase.stripePaymentIntentId ||
      object(purchase.policyAcceptance).savedPaymentMethodConsent !== true) return { isTrial: true };
  const stripe = getStripe();
  const payment = await stripe.paymentIntents.retrieve(purchase.stripePaymentIntentId);
  const customerId = id(payment.customer), paymentMethodId = id(payment.payment_method);
  if (payment.status !== 'succeeded' || payment.amount_received !== purchase.amountCents ||
      payment.currency !== purchase.currency || !customerId || !paymentMethodId ||
      (payment.metadata?.purchaseId && payment.metadata.purchaseId !== purchase.id) ||
      (payment.metadata?.userId && payment.metadata.userId !== input.userId)) return { isTrial: true };
  const method = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (method.type !== 'card' || id(method.customer) !== customerId) return { isTrial: true };
  return { isTrial: true, customerId, paymentMethodId };
}
