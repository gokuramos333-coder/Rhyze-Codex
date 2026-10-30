import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';
import type Stripe from 'stripe';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { lockMembershipEntitlements } from '@/lib/domain/credits/entitlement-lock';
import { MOMMY_AND_ME_SLUG } from '@/lib/payments/commerce-orders';

export const stripeEventPaymentLinkSchema = z.object({
  paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9]+$/),
  userId: z.string().min(1),
  occurrenceId: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.literal('usd'),
  markAttended: z.boolean(),
  reason: z.string().trim().min(10).max(500),
}).strict();

type Input = z.infer<typeof stripeEventPaymentLinkSchema> & { actorId: string };
export class StripeEventPaymentLinkError extends Error {}
function reject(message: string): never { throw new StripeEventPaymentLinkError(message); }
function objectId(value: string | { id: string } | null) { return typeof value === 'string' ? value : value?.id ?? null; }

/** Read Stripe, never create/confirm a payment or modify provider metadata. */
export async function verifyExternalEventPayment(stripe: Stripe, input: Input) {
  const intent = await stripe.paymentIntents.retrieve(input.paymentIntentId);
  if (intent.id !== input.paymentIntentId || !intent.livemode || intent.status !== 'succeeded' ||
      intent.amount !== input.amountCents || intent.amount_received !== input.amountCents || intent.currency !== input.currency) {
    reject('Payment must be a successful live payment for the exact selected amount and currency.');
  }
  const chargeId = objectId(intent.latest_charge);
  if (!chargeId) reject('Payment has no captured charge.');
  const charge = await stripe.charges.retrieve(chargeId);
  if (charge.id !== chargeId || objectId(charge.payment_intent) !== intent.id || !charge.livemode ||
      !charge.paid || !charge.captured || charge.status !== 'succeeded' || charge.disputed || charge.refunded ||
      charge.amount_refunded !== 0 || charge.amount !== input.amountCents || charge.amount_captured !== input.amountCents ||
      charge.currency !== input.currency || objectId(charge.customer) !== objectId(intent.customer)) {
    reject('Charge is unpaid, refunded, disputed, or does not match the selected payment.');
  }
  const [refunds, disputes, sessions, invoices] = await Promise.all([
    stripe.refunds.list({ payment_intent: intent.id, limit: 100 }),
    stripe.disputes.list({ charge: charge.id, limit: 1 }),
    stripe.checkout.sessions.list({ payment_intent: intent.id, limit: 100 }),
    stripe.invoicePayments.list({ payment: { type: 'payment_intent', payment_intent: intent.id }, limit: 1 }),
  ]);
  if (refunds.has_more || refunds.data.some((refund) => !['failed', 'canceled'].includes(refund.status || '')) ||
      disputes.has_more || disputes.data.length || invoices.has_more || invoices.data.length || sessions.has_more || sessions.data.length > 1) {
    reject('Payment has refund, dispute, invoice, or ambiguous Checkout history; reconcile it separately.');
  }
  for (const metadata of [intent.metadata, charge.metadata, ...sessions.data.map((session) => session.metadata)]) {
    if (metadata?.purchaseId || metadata?.membershipId || metadata?.commerceOrderId || metadata?.bookingId || metadata?.productId ||
        (metadata?.purchaseType && metadata.purchaseType !== 'EVENT') ||
        (metadata?.userId && metadata.userId !== input.userId) ||
        (metadata?.occurrenceId && metadata.occurrenceId !== input.occurrenceId)) {
      reject('Payment already identifies another purchase, member, booking, or event.');
    }
  }
  return { intent, charge, customerId: objectId(intent.customer), paidAt: new Date(charge.created * 1000) };
}

/** The caller must authenticate an approved owner; input never grants access by payer name alone. */
export async function linkStripeEventPayment(db: PrismaClient, stripe: Stripe, input: Input, now = new Date()) {
  const verified = await verifyExternalEventPayment(stripe, input);
  const { intent, charge, customerId, paidAt } = verified;
  return retrySerializableTransaction(() => db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'external-event-payment:' + intent.id}))`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.occurrenceId}))`;
        await lockMembershipEntitlements(tx, input.userId);
        const user = await tx.user.findUnique({ where: { id: input.userId } });
        const occurrence = await tx.classOccurrence.findUnique({ where: { id: input.occurrenceId }, include: { template: true } });
        if (!user || user.status !== 'ACTIVE') reject('Selected member is unavailable.');
        if (!occurrence?.template.isEvent || !['SCHEDULED', 'COMPLETED'].includes(occurrence.status)) reject('Selected event is unavailable.');
        if (occurrence.template.slug === MOMMY_AND_ME_SLUG) reject('Family-priced events require separate party reconciliation.');
        const eventAmount = occurrence.priceCents ?? occurrence.template.dropInPriceCents ?? 3000;
        if (eventAmount !== input.amountCents) reject('Payment amount does not equal the selected event ticket price.');
        if (input.markAttended && occurrence.startAt > now) reject('A future event cannot be marked attended.');
        const payerEmail = charge.billing_details.email?.trim().toLowerCase();
        if (payerEmail && payerEmail !== user.email.trim().toLowerCase()) reject('Payer email does not match the explicitly selected member.');
        if (customerId) {
          const otherCustomerOwner = await tx.user.findFirst({ where: { stripeCustomerId: customerId, id: { not: user.id } }, select: { id: true } });
          if (otherCustomerOwner || (user.stripeCustomerId && user.stripeCustomerId !== customerId)) reject('Stripe customer identity conflicts with the selected member.');
        }
        const [purchase, transfer, somble, records] = await Promise.all([
          tx.purchase.findFirst({ where: { stripePaymentIntentId: intent.id }, select: { id: true } }),
          tx.bookingTransfer.findFirst({ where: { stripePaymentIntentId: intent.id }, select: { id: true } }),
          tx.sombleTransaction.findFirst({ where: { paymentId: { in: [intent.id, charge.id] } }, select: { id: true } }),
          tx.paymentRecord.findMany({ where: { OR: [{ stripePaymentIntentId: intent.id }, { stripeEventId: `stripe-sync-charge-${charge.id}` }] } }),
        ]);
        if (purchase || transfer || somble || records.length > 1) reject('Payment already belongs to another purchase or imported transaction.');
        let order = await tx.commerceOrder.findUnique({ where: { stripePaymentIntentId: intent.id } });
        if (order) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${order.id}))`;
          // Re-read after the same lock used by refunds and webhook fulfillment.
          order = await tx.commerceOrder.findUnique({ where: { stripePaymentIntentId: intent.id } });
          if (!order || order.kind !== 'EVENT' || order.userId !== user.id || order.occurrenceId !== occurrence.id ||
              order.status !== 'PAID' || order.refundedAmountCents !== 0 || order.amountCents !== input.amountCents || order.currency !== input.currency) {
            reject('Existing order conflicts with this reconciliation.');
          }
          if (await tx.commerceRefund.findFirst({ where: { commerceOrderId: order.id }, select: { id: true } })) reject('Existing order has refund history.');
        }
        const record = records[0];
        if (record && (record.status !== 'SUCCEEDED' || record.refundedAmountCents !== 0 ||
            record.amountCents !== input.amountCents || record.currency !== input.currency || record.purchaseId || record.membershipId ||
            !['PRODUCT_PURCHASE', 'EVENT'].includes(record.kind) ||
            (record.stripePaymentIntentId && record.stripePaymentIntentId !== intent.id) ||
            record.stripeInvoiceId || record.stripeSubscriptionId || record.stripeCheckoutSessionId ||
            (record.userId && record.userId !== user.id) || (record.commerceOrderId && record.commerceOrderId !== order?.id))) {
          reject('Existing payment ledger has a conflicting owner, purpose, amount, or status.');
        }
        const competingOrder = await tx.commerceOrder.findFirst({ where: { userId: user.id, occurrenceId: occurrence.id, ...(order ? { id: { not: order.id } } : {}) }, select: { id: true } });
        if (competingOrder) reject('Member already has another order for this event; reconcile that order first.');
        let booking = await tx.booking.findUnique({ where: { occurrenceId_userId: { occurrenceId: occurrence.id, userId: user.id } } });
        if (booking) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${booking.id}))`;
          booking = await tx.booking.findUnique({ where: { occurrenceId_userId: { occurrenceId: occurrence.id, userId: user.id } } });
        }
        if (booking && (!order || booking.source !== 'STRIPE_EVENT' || !['CONFIRMED', 'ATTENDED'].includes(booking.status))) reject('Existing booking must be reconciled separately; its credits and attendance were preserved.');
        if (record?.bookingId && record.bookingId !== booking?.id) reject('Payment is already assigned to another booking.');
        if (order && (!booking || !record || record.commerceOrderId !== order.id || record.bookingId !== booking.id)) reject('Existing payment/order/booking chain is incomplete; review it separately.');
        if (!booking) {
          const overlap = await tx.booking.findFirst({ where: { userId: user.id, status: { in: ['CONFIRMED', 'ATTENDED'] }, occurrence: { startAt: { lt: occurrence.endAt }, endAt: { gt: occurrence.startAt } } }, select: { id: true } });
          if (overlap) reject('Member has an overlapping booking.');
          const occupied = await tx.booking.count({ where: { occurrenceId: occurrence.id, status: { in: ['CONFIRMED', 'ATTENDED'] } } });
          if (occupied + occurrence.historicalSignupCount >= occurrence.capacity) reject('Event is full; no booking or financial links were created.');
        }
        const attendance = await tx.attendanceRecord.findUnique({ where: { occurrenceId_userId: { occurrenceId: occurrence.id, userId: user.id } } });
        if (attendance && (attendance.bookingId !== booking?.id || !['CHECKED_IN', 'ATTENDED'].includes(attendance.status))) reject('Existing attendance conflicts with this reconciliation.');
        const alreadyLinked = Boolean(order);
        if (!order) {
          order = await tx.commerceOrder.create({ data: { userId: user.id, occurrenceId: occurrence.id, kind: 'EVENT', status: 'PAID', amountCents: input.amountCents, currency: input.currency, stripePaymentIntentId: intent.id, paidAt, customerName: user.name, customerEmail: user.email,
            items: { create: { productReference: occurrence.id, name: occurrence.template.name, description: 'Studio Stripe payment reconciled by owner', quantity: 1, unitAmountCents: input.amountCents } },
          } });
        }
        if (!booking) booking = await tx.booking.create({ data: { occurrenceId: occurrence.id, userId: user.id, source: 'STRIPE_EVENT', status: input.markAttended ? 'ATTENDED' : 'CONFIRMED', bookedAt: paidAt, policySnapshot: { accessType: 'STANDARD', accessProductKind: null, commerceOrderId: order.id, stripePaymentIntentId: intent.id, reconciliation: 'OWNER_VERIFIED_EXTERNAL_PAYMENT' } } });
        let paymentRecordId = record?.id;
        if (!alreadyLinked) {
          const paymentData = { userId: user.id, commerceOrderId: order.id, bookingId: booking.id, kind: 'EVENT' as const, status: 'SUCCEEDED' as const, amountCents: input.amountCents, currency: input.currency, customerName: user.name, customerEmail: user.email, stripeCustomerId: customerId, stripePaymentIntentId: intent.id, productName: occurrence.template.name, receiptUrl: charge.receipt_url, occurredAt: paidAt };
          const payment = record
            ? await tx.paymentRecord.update({ where: { id: record.id }, data: paymentData })
            : await tx.paymentRecord.create({ data: { ...paymentData, stripeEventId: `stripe-sync-charge-${charge.id}` } });
          paymentRecordId = payment.id;
        }
        const changeAttendance = input.markAttended && attendance?.status !== 'ATTENDED';
        if (changeAttendance) {
          const attendanceData = { bookingId: booking.id, status: 'ATTENDED' as const, markedById: input.actorId, note: input.reason };
          if (attendance) await tx.attendanceRecord.update({ where: { id: attendance.id }, data: attendanceData });
          else await tx.attendanceRecord.create({ data: { ...attendanceData, occurrenceId: occurrence.id, userId: user.id } });
          if (booking.status !== 'ATTENDED') booking = await tx.booking.update({ where: { id: booking.id }, data: { status: 'ATTENDED' } });
        }
        if (!alreadyLinked || changeAttendance) await tx.auditLog.create({ data: { actorId: input.actorId, action: alreadyLinked ? 'payment.link-event-attendance' : 'payment.link-event', entityType: 'CommerceOrder', entityId: order.id,
          before: { paymentRecordId: record?.id ?? null, paymentUserId: record?.userId ?? null, attendanceStatus: attendance?.status ?? null },
          after: { userId: user.id, occurrenceId: occurrence.id, bookingId: booking.id, paymentRecordId: paymentRecordId!, paymentIntentId: intent.id, chargeId: charge.id, amountCents: input.amountCents, currency: input.currency, paidAt: paidAt.toISOString(), verifiedAt: now.toISOString(), markAttended: input.markAttended, reason: input.reason },
        } });
        return { orderId: order.id, bookingId: booking.id, paymentRecordId: paymentRecordId!, attended: booking.status === 'ATTENDED', alreadyLinked };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 }));
}
