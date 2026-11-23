import type { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { prisma } from '@/lib/db/prisma';
import {
  applyBlackFridaySession,
  chargeRequiresReview,
  matchesSpecialEventSession,
  locallyUnpaid,
  verifiedUnpaidExpiry,
  type Ticket,
} from './black-friday-checkout';
import {
  assertFinancialSubmission,
  withFinancialRelease,
} from './financial-release';
import { assertFinancialApprover } from '@/lib/auth/financial-owner-access';
import { assertStripeObjectMode } from './stripe-mode';
import { getStripe } from './stripe';
import { retrySerializableTransaction } from './transaction-retry';

type Outcome = 'paid' | 'expired' | 'pending' | 'review';
type Dependencies = { db?: PrismaClient; stripe?: Stripe; now?: Date };
type CheckoutInput = {
  orderId: string;
  actorUserId?: string;
  explicitBuyerCancel?: boolean;
};
type Evidence = {
  outcome: Outcome;
  session?: Stripe.Checkout.Session;
  fullyRefunded?: {
    session: Stripe.Checkout.Session;
    charge: Stripe.Charge;
    intentId: string;
  };
};
type StaffContext = {
  actorId: string;
  reason: string;
  operation: 'RECONCILE' | 'CANCEL';
};
const requestOptions = { timeout: 2000, maxNetworkRetries: 0 };
const review: Evidence = { outcome: 'review' };

async function recoverSessionId(stripe: Stripe, ticket: Ticket) {
  // Checkout was created with this absolute expiry. A valid payment-mode
  // session cannot be created more than 24 hours before that expiry.
  const expires = ticket.parameters.expires_at;
  if (!expires) return null;
  let cursor: string | undefined;
  let candidate: string | undefined;
  for (let pageNumber = 0; pageNumber < 3; pageNumber++) {
    const page = await stripe.checkout.sessions.list(
      {
        created: { gte: expires - 24 * 60 * 60, lte: expires },
        limit: 100,
        ...(cursor ? { starting_after: cursor } : {}),
      },
      requestOptions,
    );
    for (const session of page.data) {
      assertStripeObjectMode(session);
      if (
        session.client_reference_id !== ticket.orderId &&
        session.metadata?.commerceOrderId !== ticket.orderId
      )
        continue;
      if (candidate) return null;
      candidate = session.id;
    }
    if (!page.has_more) return candidate ?? null;
    const next = page.data.at(-1)?.id;
    if (!next || next === cursor) return null;
    cursor = next;
  }
  return null;
}

function capturedCharge(session: Stripe.Checkout.Session) {
  const intent = session.payment_intent;
  if (!intent || typeof intent === 'string' || !intent.id) return null;
  const charge = intent.latest_charge;
  if (!charge || typeof charge === 'string' || !charge.id) return null;
  const parent =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id;
  return intent.status === 'succeeded' &&
    intent.livemode === session.livemode &&
    intent.amount === session.amount_total &&
    intent.amount_received === session.amount_total &&
    intent.currency === session.currency &&
    [
      'commerceOrderId',
      'occurrenceId',
      'userId',
      'purchaseType',
      'blackFridayTicket',
    ].every((key) => intent.metadata?.[key] === session.metadata?.[key]) &&
    parent === intent.id &&
    charge.livemode === session.livemode &&
    charge.paid &&
    charge.captured &&
    charge.amount === session.amount_total &&
    charge.currency === session.currency &&
    charge.amount_captured === session.amount_total
    ? charge
    : null;
}

// Staff callers independently authorize their role and any financial operation.
// A supplied recovery ID can narrow uniquely recovered evidence, never replace it.
export async function readSpecialEventCheckout(
  input: CheckoutInput,
  dependencies: Dependencies = {},
  expectedSessionId?: string,
  staff?: StaffContext,
): Promise<Evidence> {
  const db = dependencies.db ?? prisma;
  const now = dependencies.now ?? new Date();
  try {
    const [ticket] = await db.$queryRaw<
      Ticket[]
    >`SELECT * FROM "BlackFridayTicket" WHERE "orderId"=${input.orderId}`;
    if (
      !ticket ||
      (input.actorUserId !== undefined &&
        ticket.userId !== input.actorUserId) ||
      (input.explicitBuyerCancel && !input.actorUserId)
    )
      return review;
    const order = await db.commerceOrder.findUniqueOrThrow({
      where: { id: ticket.orderId },
    });
    const stripe = dependencies.stripe ?? getStripe();
    const id =
      order.stripeCheckoutSessionId ?? (await recoverSessionId(stripe, ticket));
    if (!id || (expectedSessionId && expectedSessionId !== id)) return review;
    const retrieve = () =>
      stripe.checkout.sessions.retrieve(
        id,
        { expand: ['payment_intent.latest_charge'] },
        requestOptions,
      );
    let session = await retrieve();
    const matches = (s: Stripe.Checkout.Session) =>
      s.id === id && matchesSpecialEventSession(s, order, ticket);
    if (!matches(session)) return review;

    if (!order.stripeCheckoutSessionId) {
      const bound = await db.commerceOrder.updateMany({
        where: { id: order.id, stripeCheckoutSessionId: null },
        data: { stripeCheckoutSessionId: id },
      });
      if (
        !bound.count &&
        (await db.commerceOrder.findUniqueOrThrow({ where: { id: order.id } }))
          .stripeCheckoutSessionId !== id
      )
        return review;
    }
    if (session.status === 'open') {
      if (
        ticket.state !== 'HELD' ||
        session.payment_status !== 'unpaid' ||
        session.payment_intent !== null ||
        !(await locallyUnpaid(db, order.id, session))
      )
        return review;
      if (!input.explicitBuyerCancel && staff?.operation !== 'CANCEL')
        return { outcome: 'pending', session };
      const openSession = session;
      await withFinancialRelease(db, async (tx, deadline) => {
        await tx.$executeRaw`SELECT id FROM "ClassOccurrence" WHERE id=${ticket.occurrenceId} FOR UPDATE`;
        await tx.$executeRaw`SELECT id FROM "CommerceOrder" WHERE id=${order.id} FOR UPDATE`;
        const fresh = await tx.commerceOrder.findUniqueOrThrow({
          where: { id: order.id },
        });
        const [held] = await tx.$queryRaw<
          Ticket[]
        >`SELECT * FROM "BlackFridayTicket" WHERE "orderId"=${order.id}`;
        if (
          held?.state !== 'HELD' ||
          fresh.stripeCheckoutSessionId !== id ||
          !matchesSpecialEventSession(openSession, fresh, held) ||
          !(await locallyUnpaid(tx, fresh.id, openSession))
        )
          throw Error('Checkout changed');
        if (staff) await assertFinancialApprover(tx, staff.actorId);
        await assertFinancialSubmission(tx, deadline);
        const accepted = await stripe.checkout.sessions.expire(
          id,
          {},
          requestOptions,
        );
        if (
          staff &&
          accepted.id === id &&
          accepted.status === 'expired' &&
          matchesSpecialEventSession(accepted, fresh, held)
        ) {
          // Keep the approval alongside the locked order before the webhook
          // can win the terminal write. Only a fresh observation releases it.
          await tx.auditLog.create({
            data: {
              actorId: staff.actorId,
              action: 'black-friday.provider-expiry-accepted',
              entityType: 'CommerceOrder',
              entityId: order.id,
              after: { stripeCheckoutSessionId: id, reason: staff.reason },
            },
          });
        }
      });
      session = await retrieve();
      if (!matches(session)) return review;
      if (session.status === 'open') {
        return session.payment_status === 'unpaid' &&
          session.payment_intent === null &&
          (await locallyUnpaid(db, order.id, session))
          ? { outcome: 'pending', session }
          : review;
      }
    }
    if (session.status === 'expired' && !verifiedUnpaidExpiry(session))
      return review;
    if (session.status === 'complete' && session.payment_status === 'paid') {
      const charge = capturedCharge(session);
      if (!charge || chargeRequiresReview(charge)) {
        if (
          staff?.operation === 'RECONCILE' &&
          ticket.state === 'HELD' &&
          !order.paidAt &&
          charge &&
          charge.disputed === false &&
          charge.refunded === true &&
          charge.amount_refunded === order.amountCents &&
          typeof session.payment_intent === 'object' &&
          session.payment_intent
        ) {
          return {
            outcome: 'review',
            fullyRefunded: {
              session,
              charge,
              intentId: session.payment_intent.id,
            },
          };
        }
        return order.paidAt && order.stripePaymentIntentId
          ? { outcome: 'review', session }
          : review;
      }
    }
    return await retrySerializableTransaction(() =>
      db.$transaction(
        async (tx): Promise<Evidence> => {
          await applyBlackFridaySession(
            tx,
            session,
            now,
            staff?.actorId ?? input.actorUserId,
            staff?.reason,
          );
          const [updated] = await tx.$queryRaw<
            { state: string; status: string }[]
          >`
        SELECT t.state, o.status::text FROM "BlackFridayTicket" t JOIN "CommerceOrder" o ON o.id=t."orderId"
        WHERE t."orderId"=${order.id}`;
          if (
            session.status === 'expired' &&
            session.payment_status === 'unpaid' &&
            updated.state === 'EXPIRED' &&
            updated.status === 'PAYMENT_FAILED'
          )
            return { outcome: 'expired' };
          if (
            session.status === 'complete' &&
            session.payment_status === 'paid'
          ) {
            return {
              outcome:
                updated.state === 'PAID' && updated.status === 'PAID'
                  ? 'paid'
                  : 'review',
              session,
            };
          }
          return review;
        },
        // Unpaid expiry rereads under explicit occurrence and order row locks.
        // READ COMMITTED lets each waiter see the preceding release. Paid
        // eligibility still needs the existing serializable transaction.
        {
          isolationLevel:
            session.status === 'expired' ? 'ReadCommitted' : 'Serializable',
        },
      ),
    );
  } catch {
    return review;
  }
}

export async function reconcileSpecialEventCheckout(
  input: CheckoutInput,
  dependencies: Dependencies = {},
): Promise<Outcome> {
  return (await readSpecialEventCheckout(input, dependencies)).outcome;
}

export async function reconcileDueSpecialEventCheckouts(
  { limit = 6, now = new Date() }: { limit?: number; now?: Date } = {},
  dependencies: Dependencies = {},
) {
  const db = dependencies.db ?? prisma;
  const count = Number.isFinite(limit)
    ? Math.min(12, Math.max(0, Math.floor(limit)))
    : 6;
  const retryBefore = new Date(now.getTime() - 15 * 60 * 1000);
  const due = await db.$queryRaw<{ orderId: string }[]>`
    WITH due AS (
      SELECT t."orderId" FROM "BlackFridayTicket" t
      LEFT JOIN "SpecialEventCheckoutAttempt" a ON a."orderId"=t."orderId"
      WHERE t.state='HELD' AND t."expiresAt"<=${now.toISOString()}::timestamp
        AND (a."attemptedAt" IS NULL OR a."attemptedAt"<=${retryBefore.toISOString()}::timestamp)
      ORDER BY a."attemptedAt" NULLS FIRST, t."expiresAt", t."orderId"
      LIMIT ${count} FOR UPDATE OF t SKIP LOCKED
    )
    INSERT INTO "SpecialEventCheckoutAttempt" ("orderId","attemptedAt")
    SELECT "orderId",${now.toISOString()}::timestamp FROM due
    ON CONFLICT ("orderId") DO UPDATE SET "attemptedAt"=EXCLUDED."attemptedAt"
      WHERE "SpecialEventCheckoutAttempt"."attemptedAt"<=${retryBefore.toISOString()}::timestamp
    RETURNING "orderId"`;
  const summary: Record<Outcome, number> = {
    paid: 0,
    expired: 0,
    pending: 0,
    review: 0,
  };
  const outcomes = await Promise.allSettled(
    due.map((row) =>
      reconcileSpecialEventCheckout(row, { ...dependencies, db, now }),
    ),
  );
  for (const outcome of outcomes)
    summary[outcome.status === 'fulfilled' ? outcome.value : 'review']++;
  return summary;
}
