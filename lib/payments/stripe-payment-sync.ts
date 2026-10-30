import type Stripe from 'stripe';
import type { PrismaClient } from '@prisma/client';
import { getStripe, stripeIsConfigured } from '@/lib/payments/stripe';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { assertStripeObjectMode } from '@/lib/payments/stripe-mode';

const DEFAULT_LOOKBACK_DAYS = 7;

function isCollectedCharge(charge: Stripe.Charge) {
  return charge.paid && charge.captured !== false && Number.isSafeInteger(charge.amount_captured) && charge.amount_captured > 0;
}

function objectId(value: string | { id: string } | null | undefined) {
  return typeof value === 'string' ? value : value?.id || null;
}

function financialBalance(value: string | Stripe.BalanceTransaction | null | undefined) {
  if (!value || typeof value === 'string') return null;
  return { id: value.id, amount: value.amount, currency: value.currency, fee: value.fee, net: value.net, created: value.created, type: value.type, exchange_rate: value.exchange_rate };
}

async function readAdjustmentPages<T extends { id: string }>(read: (cursor?: string) => PromiseLike<{ data: T[]; has_more: boolean }>) {
  const rows: T[] = [];
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const page = await read(cursor);
    rows.push(...page.data);
    if (!page.has_more) return rows;
    const next = page.data.at(-1)?.id;
    if (!next || next === cursor) throw new Error('Provider adjustment pagination did not advance.');
    cursor = next;
  }
  throw new Error('Provider adjustment history exceeds the safe page bound; review this charge separately.');
}

export async function financialReceipt(stripe: Stripe, account: string, charge: Stripe.Charge, expectedMode?: boolean) {
  const refunds = charge.amount_refunded > 0 || charge.refunds?.data.length || charge.refunds?.has_more
    ? await readAdjustmentPages(cursor => stripe.refunds.list({ charge: charge.id, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }))
    : [];
  const disputes = charge.disputed
    ? await readAdjustmentPages(cursor => stripe.disputes.list({ charge: charge.id, limit: 100, ...(cursor ? { starting_after: cursor } : {}) }))
    : [];
  for (const adjustment of [...refunds, ...disputes]) {
    if (expectedMode !== undefined && 'livemode' in adjustment && adjustment.livemode !== expectedMode) throw new Error('Provider adjustment mode differs from the signed event.');
    if (objectId(adjustment.charge) !== charge.id) throw new Error('Provider adjustment belongs to a different charge.');
  }
  if (refunds.filter(refund => refund.status === 'succeeded').reduce((total, refund) => total + refund.amount, 0) !== charge.amount_refunded) {
    throw new Error('Provider refund total does not match the complete succeeded refund history.');
  }
  const balance = financialBalance(charge.balance_transaction);
  const id = `rhyze-payment-reconciled-${account}-${charge.id}`;
  const payload = {
    id, type: 'rhyze.payment.reconciled', account, livemode: charge.livemode,
    created: charge.created, reconciledAt: new Date().toISOString(),
    data: { object: {
      id: charge.id, object: 'charge', payment_intent: objectId(charge.payment_intent), source_transfer: objectId(charge.source_transfer),
      paid: charge.paid, captured: charge.captured ?? (charge.amount_captured > 0),
      status: charge.status, amount: charge.amount, amount_captured: charge.amount_captured,
      currency: charge.currency, amount_refunded: charge.amount_refunded,
      refunded: charge.refunded, disputed: charge.disputed, created: charge.created,
      capturedAt: balance?.created ?? null,
      balance_transaction: balance,
      refunds: { data: refunds.map(refund => ({ id: refund.id, amount: refund.amount, currency: refund.currency, status: refund.status, created: refund.created, charge: objectId(refund.charge), payment_intent: objectId(refund.payment_intent) })) },
      disputes: { data: disputes.map(dispute => ({ id: dispute.id, amount: dispute.amount, currency: dispute.currency, status: dispute.status, created: dispute.created, charge: objectId(dispute.charge), payment_intent: objectId(dispute.payment_intent), balance_transactions: dispute.balance_transactions.map(financialBalance) })) },
    } },
  };
  return { id, type: 'rhyze.payment.reconciled', payload: JSON.parse(JSON.stringify(payload)), processedAt: new Date() };
}

function fromUnix(seconds: number | null | undefined) {
  return seconds ? new Date(seconds * 1000) : new Date();
}

function paymentStatus(charge: Stripe.Charge): 'SUCCEEDED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'DISPUTED' {
  if (charge.disputed) return 'DISPUTED';
  if (charge.amount_captured > 0 && charge.amount_refunded >= charge.amount_captured) return 'REFUNDED';
  if (charge.amount_refunded > 0) return 'PARTIALLY_REFUNDED';
  return 'SUCCEEDED';
}

function emailFromCharge(charge: Stripe.Charge) {
  return (
    charge.billing_details?.email ||
    (typeof charge.metadata?.customerEmail === 'string' ? charge.metadata.customerEmail : null) ||
    (typeof charge.metadata?.email === 'string' ? charge.metadata.email : null) ||
    null
  );
}

function nameFromCharge(charge: Stripe.Charge) {
  return (
    charge.billing_details?.name ||
    (typeof charge.metadata?.customerName === 'string' ? charge.metadata.customerName : null) ||
    null
  );
}

function paymentIntentIdentifier(charge: Stripe.Charge) {
  const intent = charge.payment_intent;
  if (typeof intent === 'string') return intent;
  if (intent?.id) return intent.id;
  return `charge_${charge.id}`;
}

export async function paidCheckoutSessionForPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string,
) {
  if (paymentIntentId.startsWith('charge_')) return null;
  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  } as Stripe.Checkout.SessionListParams);
  const session = sessions.data[0];
  if (!session || session.payment_status !== 'paid') return null;
  if (!session.metadata?.purchaseId && !session.metadata?.commerceOrderId) return null;
  return session;
}

export function syntheticCheckoutEvent(session: Stripe.Checkout.Session, charge: Stripe.Charge) {
  return {
    id: `stripe-sync-checkout-${session.id}`,
    type: 'checkout.session.completed',
    livemode: session.livemode,
    created: charge.created,
    data: { object: { ...session, amount_total: charge.amount_captured ?? charge.amount, currency: charge.currency } },
  } as Stripe.Event;
}

export async function syncRecentStripePaymentRecords(
  prisma: PrismaClient,
  options: {
    lookbackDays?: number;
    limit?: number;
    /** Historical charge creation window: from inclusive, to exclusive. */
    from?: Date;
    to?: Date;
    maxPages?: number;
    startingAfter?: string;
    /** Historical runs never replay entitlements or send notifications. */
    financialOnly?: boolean;
    dryRun?: boolean;
  } = {},
) {
  const historical = Boolean(options.from || options.to);
  if (historical && (!options.from || !options.to || !Number.isFinite(options.from.getTime()) || !Number.isFinite(options.to.getTime()) || options.from >= options.to)) {
    throw new Error('Historical Stripe sync requires valid from/to bounds (from inclusive, to exclusive).');
  }
  const limit = options.limit ?? 100;
  const maxPages = options.maxPages ?? 1;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) throw new Error('Stripe sync limit must be 1–100 and maxPages must be 1–100.');
  if (!stripeIsConfigured()) return { attempted: false, synced: 0, reason: 'stripe-unconfigured' };

  const stripe = getStripe();
  const createdGte = Math.floor(
    (Date.now() - (options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS) * 24 * 60 * 60 * 1000) / 1000,
  );
  const created = historical
    ? { gte: Math.floor(options.from!.getTime() / 1000), lt: Math.ceil(options.to!.getTime() / 1000) }
    : { gte: createdGte };
  const account = await stripe.accounts.retrieve();
  // Snapshot receipt versions BEFORE reading charges. A concurrent webhook or sync must
  // not be overwritten by an older charge snapshot after slow adjustment pagination.
  const receiptVersions = new Map((options.dryRun ? [] : await prisma.stripeEvent.findMany({
    where: { type: { in: ['rhyze.payment.reconciled', 'rhyze.payment.reconciliation-pending'] }, payload: { path: ['account'], equals: account.id } },
    select: { id: true, type: true, processedAt: true, error: true },
  })).map(receipt => [receipt.id, receipt]));
  const charges: { data: Stripe.Charge[] } = { data: [] };
  let pagesRead = 0;
  let hasMore = false;
  let nextCursor = options.startingAfter;
  do {
    const page = await stripe.charges.list({ created, limit, expand: ['data.balance_transaction'], ...(nextCursor ? { starting_after: nextCursor } : {}) });
    // Validate all bounded pages before any local writes.
    page.data.forEach(assertStripeObjectMode);
    charges.data.push(...page.data);
    pagesRead += 1;
    hasMore = Boolean(page.has_more);
    const lastId = page.data.at(-1)?.id;
    if (hasMore && (!lastId || lastId === nextCursor)) throw new Error('Stripe pagination did not advance; no records were written.');
    nextCursor = hasMore ? lastId : undefined;
  } while (hasMore && pagesRead < maxPages);
  const financialOnly = historical || options.financialOnly === true;
  // Fetch and validate complete provider receipts before any local writes.
  const providerReceipts = new Map<string, Awaited<ReturnType<typeof financialReceipt>>>();
  for (const charge of charges.data) providerReceipts.set(charge.id, await financialReceipt(stripe, account.id, charge));
  const providerTotals = { capturedByCurrency: {} as Record<string, number>, refundedByCurrency: {} as Record<string, number>, feesByCurrency: {} as Record<string, number>, chargesWithUnknownFees: 0 };
  for (const receipt of providerReceipts.values()) {
    const charge = receipt.payload.data.object;
    if (charge.paid && charge.captured !== false && charge.amount_captured > 0) {
      providerTotals.capturedByCurrency[charge.currency] = (providerTotals.capturedByCurrency[charge.currency] || 0) + charge.amount_captured;
      if (charge.balance_transaction) {
        const balance = charge.balance_transaction;
        providerTotals.feesByCurrency[balance.currency] = (providerTotals.feesByCurrency[balance.currency] || 0) + balance.fee;
      } else providerTotals.chargesWithUnknownFees += 1;
    }
    for (const refund of charge.refunds.data) if (refund.status === 'succeeded') providerTotals.refundedByCurrency[refund.currency] = (providerTotals.refundedByCurrency[refund.currency] || 0) + refund.amount;
  }

  const diagnostics = {
    account: account.id,
    chargeCount: charges.data.length,
    liveCharges: charges.data.filter((charge) => charge.livemode).length,
    testCharges: charges.data.filter((charge) => !charge.livemode).length,
    paidUsdCharges: charges.data.filter((charge) => charge.paid && charge.currency.toLowerCase() === 'usd').length,
    paidCharges: charges.data.filter(charge => charge.paid).length,
    capturedCharges: charges.data.filter(isCollectedCharge).length,
    currencies: charges.data.filter(charge => charge.paid).reduce<Record<string, number>>((counts, charge) => { counts[charge.currency.toLowerCase()] = (counts[charge.currency.toLowerCase()] || 0) + 1; return counts; }, {}),
    newestChargeAt: charges.data[0]?.created ? fromUnix(charges.data[0].created).toISOString() : null,
  };
  // Validate the entire provider batch before touching any local payment record.
  charges.data.forEach(assertStripeObjectMode);
  const sombleBackedPaymentIds = new Set(
    (
      await prisma.sombleTransaction.findMany({
        where: { paymentId: { in: [...new Set(charges.data.flatMap(charge => [charge.id, paymentIntentIdentifier(charge)]))] } },
        select: { paymentId: true },
      })
    ).map((transaction) => transaction.paymentId),
  );
  const isSombleBacked = (charge: Stripe.Charge) => sombleBackedPaymentIds.has(charge.id) || sombleBackedPaymentIds.has(paymentIntentIdentifier(charge));
  const candidates = charges.data.filter((charge) => isCollectedCharge(charge) && !isSombleBacked(charge));
  const existingPaymentRecords = candidates.length
    ? await prisma.paymentRecord.findMany({
        where: {
          OR: [
            { stripePaymentIntentId: { in: candidates.map(paymentIntentIdentifier) } },
            { stripeEventId: { in: candidates.map((charge) => `stripe-sync-charge-${charge.id}`) } },
          ],
        },
        select: {
          id: true,
          userId: true,
          stripePaymentIntentId: true,
          stripeEventId: true,
          status: true,
          amountCents: true,
          currency: true,
          occurredAt: true,
          refundedAmountCents: true,
          purchaseId: true,
          purchase: { select: { status: true } },
          commerceOrderId: true,
          commerceOrder: { select: { status: true } },
          membershipId: true,
        },
      })
    : [];
  const recordByPaymentIntent = new Map(existingPaymentRecords
    .filter((record) => record.stripePaymentIntentId)
    .map((record) => [record.stripePaymentIntentId, record]));
  const recordByEventId = new Map(existingPaymentRecords.map((record) => [record.stripeEventId, record]));

  let synced = 0;
  let wouldSync = 0;
  let unchanged = 0;
  let fulfilledCheckoutSessions = 0;
  let skippedSombleBacked = 0;
  let receiptsStored = 0;
  let supersededReceipts = 0;
  for (const charge of charges.data) {
    const receipt = providerReceipts.get(charge.id);
    if (receipt && !options.dryRun) {
      const previous = receiptVersions.get(receipt.id);
      let stored = false;
      if (previous) {
        const result = await prisma.stripeEvent.updateMany({ where: { id: previous.id, type: previous.type, processedAt: previous.processedAt, error: previous.error }, data: { ...receipt, error: null } });
        stored = result.count === 1;
      } else {
        try {
          await prisma.stripeEvent.create({ data: receipt });
          stored = true;
        } catch (error) {
          if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') throw error;
        }
      }
      if (!stored) { supersededReceipts += 1; continue; }
      receiptsStored += 1;
    }
    if (!isCollectedCharge(charge)) continue;
    if (isSombleBacked(charge)) {
      skippedSombleBacked += 1;
      continue;
    }
    const status = paymentStatus(charge);
    const paymentIntentId = paymentIntentIdentifier(charge);
    const amountCents = charge.amount_captured ?? charge.amount;
    const existingByCharge = recordByPaymentIntent.get(paymentIntentId) ||
      recordByEventId.get(`stripe-sync-charge-${charge.id}`);
    if (
      existingByCharge?.commerceOrderId &&
      ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(status)
    ) {
      unchanged += 1;
      continue;
    }
    const purchaseResolved = existingByCharge?.purchase?.status === (
      status === 'SUCCEEDED' ? 'PAID' : status
    );
    const commerceResolved = existingByCharge?.commerceOrder?.status === (
      status === 'SUCCEEDED' ? 'PAID' : status
    ) || (status === 'SUCCEEDED' && existingByCharge?.commerceOrder?.status === 'FULFILLMENT_REVIEW');
    if (
      existingByCharge &&
      existingByCharge.status === status &&
      existingByCharge.amountCents === amountCents &&
      existingByCharge.currency === charge.currency.toLowerCase() &&
      existingByCharge.occurredAt.getTime() === charge.created * 1000 &&
      existingByCharge.refundedAmountCents === charge.amount_refunded &&
      (purchaseResolved || commerceResolved || (status === 'SUCCEEDED' && Boolean(existingByCharge.membershipId)))
    ) {
      unchanged += 1;
      continue;
    }

    wouldSync += 1;
    if (options.dryRun) continue;
    const customerEmail = emailFromCharge(charge);
    const customerName = nameFromCharge(charge);
    const checkoutSession = financialOnly && existingByCharge
      ? null
      : await paidCheckoutSessionForPaymentIntent(stripe, paymentIntentId);
    const existingPaymentRecord = existingByCharge || (checkoutSession
      ? await prisma.paymentRecord.findFirst({
          where: { stripeCheckoutSessionId: checkoutSession.id },
          select: { id: true, userId: true, purchaseId: true, commerceOrderId: true, membershipId: true },
        })
      : null);
    // A billing email identifies the payer, who may be paying for another member.
    // Keep established ownership; only use email for an otherwise unlinked charge.
    const hasExistingOwnership = Boolean(existingPaymentRecord && (existingPaymentRecord.userId || existingPaymentRecord.purchaseId || existingPaymentRecord.commerceOrderId || existingPaymentRecord.membershipId));
    const chargeOwner = charge.metadata?.userId || null;
    const sessionOwner = checkoutSession?.metadata?.userId || null;
    const ownerConflict = Boolean(chargeOwner && sessionOwner && chargeOwner !== sessionOwner);
    const metadataOwner = sessionOwner || chargeOwner;
    const hasOwnershipMetadata = [charge.metadata, checkoutSession?.metadata].some(metadata => metadata?.userId || metadata?.purchaseId || metadata?.commerceOrderId || metadata?.membershipId);
    const user = hasExistingOwnership || ownerConflict ? null : metadataOwner
      ? await prisma.user.findFirst({ where: { id: metadataOwner }, select: { id: true } })
      : !hasOwnershipMetadata && customerEmail
        ? await prisma.user.findFirst({ where: { email: { equals: customerEmail, mode: 'insensitive' } }, select: { id: true } })
        : null;
    const paymentRecordData = {
      status,
      amountCents,
      currency: charge.currency.toLowerCase(),
      refundedAmountCents: charge.amount_refunded,
      receiptUrl: charge.receipt_url || null,
      occurredAt: fromUnix(charge.created),
      ...(!hasExistingOwnership ? { customerName, customerEmail } : {}),
      stripeCustomerId: typeof charge.customer === 'string' ? charge.customer : charge.customer?.id || null,
      ...(checkoutSession ? { stripeCheckoutSessionId: checkoutSession.id } : {}),
      ...(user ? { userId: user.id } : {}),
    };
    if (existingPaymentRecord) {
      await prisma.paymentRecord.update({
        where: { id: existingPaymentRecord.id },
        data: paymentRecordData,
      });
    } else {
      await prisma.paymentRecord.create({
        data: {
          ...paymentRecordData,
          userId: user?.id || null,
          kind: 'PRODUCT_PURCHASE',
          stripeEventId: `stripe-sync-charge-${charge.id}`,
          stripePaymentIntentId: paymentIntentId,
        },
      });
    }
    if (checkoutSession && !financialOnly && status === 'SUCCEEDED') {
      await prisma.$transaction(async (tx) => {
        await processStripeEvent(tx, syntheticCheckoutEvent(checkoutSession, charge));
      });
      fulfilledCheckoutSessions += 1;
    }
    synced += 1;
  }

  return { attempted: true, synced, wouldSync, unchanged, receiptsStored, supersededReceipts, receiptsRead: providerReceipts.size, providerTotals, ...(options.dryRun ? { providerReceipts: [...providerReceipts.values()].map(receipt => receipt.payload) } : {}), observedAt: new Date().toISOString(), totalsBasis: 'Captured amounts and all succeeded refunds for charges created in the requested window; currencies are never combined.', fulfilledCheckoutSessions, skippedSombleBacked, pagesRead, hasMore, nextCursor: nextCursor || null, financialOnly, dryRun: options.dryRun ?? false, ...diagnostics };
}
