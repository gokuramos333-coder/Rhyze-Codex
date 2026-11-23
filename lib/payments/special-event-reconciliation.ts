import type { PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { prisma } from '@/lib/db/prisma';
import {
  applyBlackFridaySession,
  matchesSpecialEventSession,
  verifiedUnpaidExpiry,
  type Ticket,
} from './black-friday-checkout';
import {
  assertFinancialSubmission,
  withFinancialRelease,
} from './financial-release';
import { getStripe } from './stripe';
import { retrySerializableTransaction } from './transaction-retry';

type Outcome = 'paid' | 'expired' | 'pending' | 'review';
type Dependencies = { db?: PrismaClient; stripe?: Stripe; now?: Date };
type CheckoutInput = {
  orderId: string;
  actorUserId?: string;
  explicitBuyerCancel?: boolean;
};
type Evidence = { outcome: Outcome; session?: Stripe.Checkout.Session };
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

function cleanCapturedPayment(session: Stripe.Checkout.Session) {
  const intent = session.payment_intent;
  if (!intent || typeof intent === 'string') return false;
  const charge = intent.latest_charge;
  if (!charge || typeof charge === 'string') return false;
  const parent =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id;
  return (
    intent.status === 'succeeded' &&
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
    charge.disputed === false &&
    charge.amount_refunded === 0 &&
    charge.currency === session.currency &&
    charge.amount_captured === session.amount_total
  );
}

// Staff callers independently authorize their role and any financial operation.
// A supplied recovery ID can narrow uniquely recovered evidence, never replace it.
export async function readSpecialEventCheckout(
  input: CheckoutInput,
  dependencies: Dependencies = {},
  expectedSessionId?: string,
): Promise<Evidence> {
  const db = dependencies.db ?? prisma;
  const now = dependencies.now ?? new Date();
  const [ticket] = await db.$queryRaw<
    Ticket[]
  >`SELECT * FROM "BlackFridayTicket" WHERE "orderId"=${input.orderId}`;
  if (
    !ticket ||
    (input.actorUserId !== undefined && ticket.userId !== input.actorUserId) ||
    (input.explicitBuyerCancel && !input.actorUserId)
  )
    return review;
  const order = await db.commerceOrder.findUniqueOrThrow({
    where: { id: ticket.orderId },
  });
  try {
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
    if (
      input.explicitBuyerCancel &&
      ticket.state === 'HELD' &&
      session.status === 'open' &&
      session.payment_status === 'unpaid' &&
      session.payment_intent === null
    ) {
      await withFinancialRelease(db, async (tx, deadline) => {
        await assertFinancialSubmission(tx, deadline);
        await stripe.checkout.sessions.expire(id, {}, requestOptions);
      });
      session = await retrieve();
      if (!matches(session)) return review;
    }
    if (session.status === 'expired' && !verifiedUnpaidExpiry(session)) return review;
    if (session.status === 'open') {
      return ticket.state === 'HELD' &&
        session.payment_status === 'unpaid' &&
        session.payment_intent === null
        ? { outcome: 'pending', session }
        : review;
    }
    if (
      session.status === 'complete' &&
      session.payment_status === 'paid' &&
      !cleanCapturedPayment(session)
    ) {
      // A known paid order can still need the staff refund/dispute workflow.
      // An unreconciled checkout cannot grant a booking from a reversed charge.
      return order.paidAt && order.stripePaymentIntentId
        ? { outcome: 'review', session }
        : review;
    }
    return await retrySerializableTransaction(() =>
      db.$transaction(
        async (tx): Promise<Evidence> => {
          await applyBlackFridaySession(tx, session, now, input.actorUserId);
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
        { isolationLevel: 'Serializable' },
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
  await Promise.all(
    due.map(async (row) => {
      const outcome = await reconcileSpecialEventCheckout(row, {
        ...dependencies,
        db,
        now,
      });
      summary[outcome]++;
    }),
  );
  return summary;
}
