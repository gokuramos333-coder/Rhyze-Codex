/** Explicit release check. Test Stripe only + disposable local PostgreSQL only.
 * Reads an existing test API key from stdin; never stores or prints credentials.
 * No live users, production writes, webhook configuration or email delivery.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import {
  quoteAdminPlanChange,
  confirmAdminPlanChange,
} from '@/lib/payments/admin-plan-change';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import {
  attributionFromCookie,
  attributionMetadata,
} from '@/lib/attribution/first-touch';

async function main() {
  const url = process.env.PLAN_CHANGE_TEST_DATABASE_URL;
  if (
    !url ||
    new URL(url).hostname !== '127.0.0.1' ||
    new URL(url).pathname !== '/membership_plan_test'
  )
    throw Error('Use disposable local membership_plan_test');
  if (process.env.EMAIL_DELIVERY_ENABLED !== 'false')
    throw Error('Disable email delivery');
  console.log('Waiting for existing Stripe TEST key on stdin (not echoed).');
  const key = await new Promise<string>((resolve) => {
    process.stdin.once('data', (data) => {
      process.stdin.pause();
      resolve(String(data).trim());
    });
  });
  if (!/^(sk|rk)_test_/.test(key)) throw Error('Only Stripe TEST keys allowed');
  const stripe = new Stripe(key);
  const account = await stripe.accounts.retrieve();
  assert.equal(account.id, 'acct_1Tu0UqRIYui0I7dP');
  const db = new PrismaClient({ datasourceUrl: url });
  const cleanupRun = process.env.CLEANUP_TEST_RUN;
  if (cleanupRun) {
    if (!/^rhyze-test-[a-f0-9-]{36}$/.test(cleanupRun))
      throw Error('Invalid cleanup test run');
    const prior = await db.product.findMany({
      where: { id: { startsWith: `${cleanupRun}-product-` } },
      select: { stripePriceId: true },
    });
    for (const item of prior) {
      const price = await stripe.prices.retrieve(item.stripePriceId!, {
        expand: ['product'],
      });
      assert.equal(price.livemode, false);
      const product = price.product as Stripe.Product;
      assert.equal(product.metadata.testRun, cleanupRun);
      await stripe.products.update(product.id, { active: false });
      assert.equal((await stripe.products.retrieve(product.id)).active, false);
    }
    console.log(
      `PASS archived ${prior.length} products from the explicitly selected prior test run`,
    );
  }
  const run = `rhyze-test-${randomUUID()}`;
  const clocks: string[] = [];
  const products: Array<{
    id: string;
    stripeProduct: string;
    priceId: string;
    cents: number;
    credits: number;
  }> = [];
  const createdUsers: string[] = [];
  const start = Math.floor(Date.now() / 1000) - 15 * 86400;
  const middle = start + 7 * 86400;
  const identifier = (value: any): string =>
    typeof value === 'string' ? value : value?.id;
  async function advance(clock: string, to: number) {
    await stripe.testHelpers.testClocks.advance(clock, { frozen_time: to });
    for (let attempt = 0; attempt < 60; attempt++) {
      const state = await stripe.testHelpers.testClocks.retrieve(clock);
      if (state.status === 'ready') return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw Error('Stripe test clock did not finish advancing');
  }
  async function invoice(id: string) {
    return stripe.invoices.retrieve(id, { expand: ['payments.data.payment'] });
  }
  async function applyInvoice(
    id: string,
    type: 'invoice.paid' | 'invoice.payment_failed',
    at: number,
  ) {
    const object = await invoice(id);
    assert.equal(object.livemode, false);
    await db.$transaction(
      (tx) =>
        processStripeEvent(tx, {
          id: `${run}:${type}:${id}`,
          object: 'event',
          api_version: null,
          created: at,
          data: { object },
          livemode: false,
          pending_webhooks: 0,
          request: null,
          type,
        } as Stripe.Event),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return object;
  }
  async function fixture(index: number) {
    const plan = products[index];
    const id = `${run}-${createdUsers.length}`;
    const clock = await stripe.testHelpers.testClocks.create({
      frozen_time: start,
      name: id,
    });
    clocks.push(clock.id);
    const customer = await stripe.customers.create({
      name: 'RHYZE AUTOMATED TEST ONLY',
      email: `${id}@example.test`,
      test_clock: clock.id,
      metadata: { testRun: run },
    });
    const pm = await stripe.paymentMethods.attach('pm_card_visa', {
      customer: customer.id,
    });
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: plan.priceId }],
      default_payment_method: pm.id,
      payment_behavior: 'error_if_incomplete',
    });
    assert.equal(sub.livemode, false);
    assert.equal(sub.status, 'active');
    const initialInvoice = await invoice(identifier(sub.latest_invoice));
    assert.equal(initialInvoice.status, 'paid');
    const period = sub.items.data[0];
    await db.user.create({
      data: {
        id,
        email: `${id}@example.test`,
        name: 'Synthetic Stripe Test',
        stripeCustomerId: customer.id,
      },
    });
    createdUsers.push(id);
    await db.purchase.create({
      data: {
        id,
        userId: id,
        productId: plan.id,
        amountCents: plan.cents,
        status: 'PAID',
        paidAt: new Date(period.current_period_start * 1000),
      },
    });
    await db.membership.create({
      data: {
        id,
        userId: id,
        productId: plan.id,
        purchaseId: id,
        status: 'ACTIVE',
        stripeSubscriptionId: sub.id,
        currentPeriodStart: new Date(period.current_period_start * 1000),
        currentPeriodEnd: new Date(period.current_period_end * 1000),
      },
    });
    await db.creditAccount.create({
      data: {
        id,
        userId: id,
        sourcePurchaseId: id,
        label: 'Synthetic Stripe Test',
        validFrom: new Date(period.current_period_start * 1000),
        validUntil: new Date(period.current_period_end * 1000),
        entries: {
          create: [
            {
              type: 'GRANT',
              quantity: plan.credits,
              createdAt: new Date(start * 1000),
            },
            {
              type: 'RESERVE',
              quantity: -2,
              createdAt: new Date((start + 100) * 1000),
            },
          ],
        },
      },
    });
    await advance(clock.id, middle);
    return {
      id,
      sub: sub.id,
      customer: customer.id,
      pm: pm.id,
      clock: clock.id,
      end: period.current_period_end,
      start: period.current_period_start,
    };
  }
  async function change(
    f: Awaited<ReturnType<typeof fixture>>,
    to: number,
    timing = 'NOW',
    date = '',
  ) {
    const quote = await quoteAdminPlanChange(
      db,
      stripe,
      {
        userId: f.id,
        membershipId: f.id,
        productId: products[to].id,
        actorId: f.id,
        timing,
        date,
      },
      new Date(middle * 1000),
    );
    const result = await confirmAdminPlanChange(
      db,
      stripe,
      { quoteId: quote.id, userId: f.id, actorId: f.id },
      new Date(middle * 1000),
    );
    return { quote, result };
  }
  async function verifyApplied(
    f: Awaited<ReturnType<typeof fixture>>,
    to: number,
    balance: number,
  ) {
    const membership = await db.membership.findUniqueOrThrow({
      where: { id: f.id },
    });
    const credit = await db.creditAccount.findUniqueOrThrow({
      where: { id: f.id },
      include: { entries: true },
    });
    assert.equal(membership.productId, products[to].id);
    assert.equal(
      credit.entries.reduce((sum, entry) => sum + entry.quantity, 0),
      balance,
    );
    const sub = await stripe.subscriptions.retrieve(f.sub);
    assert.equal(sub.items.data[0].price.id, products[to].priceId);
    assert.equal(sub.billing_cycle_anchor, f.start);
  }
  try {
    for (const [index, cents, credits] of [
      [0, 9200, 4],
      [1, 16800, 8],
    ] as const) {
      const price = await stripe.prices.create({
        currency: 'usd',
        unit_amount: cents,
        recurring: { interval: 'month' },
        product_data: {
          name: `${run} plan ${index}`,
          metadata: { testRun: run },
        },
      });
      assert.equal(price.livemode, false);
      const id = `${run}-product-${index}`;
      products.push({
        id,
        stripeProduct: identifier(price.product),
        priceId: price.id,
        cents,
        credits,
      });
      await db.product.create({
        data: {
          id,
          name: `Test plan ${index}`,
          slug: id,
          description: 'Synthetic only',
          kind: 'LIMITED_MEMBERSHIP',
          billingInterval: 'MONTHLY',
          priceCents: cents,
          includedCredits: credits,
          eligibleCategoryIds: [],
          stripePriceId: price.id,
        },
      });
    }
    const source = attributionFromCookie(
      '{"fbclid":"abc123","utm_source":"meta"}',
      'https://www.rhyzefitness.com',
    );
    const checkout = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: products[0].priceId, quantity: 1 }],
      success_url: 'http://localhost:3000/member/membership?result=success',
      cancel_url: 'http://localhost:3000/member/membership?result=cancelled',
      metadata: attributionMetadata(source),
    });
    assert.equal(checkout.livemode, false);
    assert.equal(checkout.metadata?.source_label, 'Meta Ad');
    assert.equal(checkout.metadata?.source_fbclid, 'abc123');
    await stripe.checkout.sessions.expire(checkout.id);
    console.log(
      'PASS real Stripe TEST Checkout Session accepts source metadata',
    );

    const upgrade = await fixture(0);
    const upgraded = await change(upgrade, 1);
    assert.equal(upgraded.result.status, 'APPLIED');
    await verifyApplied(upgrade, 1, 6);
    console.log(
      'PASS immediate upgrade: paid proration, original renewal anchor, 8 minus 2 used credits',
    );

    const renewalDecline = await stripe.paymentMethods.attach(
      'pm_card_chargeCustomerFail',
      { customer: upgrade.customer },
    );
    await stripe.subscriptions.update(upgrade.sub, {
      default_payment_method: renewalDecline.id,
    });
    await advance(upgrade.clock, upgrade.end + 3700);
    let failedRenewalSub = await stripe.subscriptions.retrieve(upgrade.sub);
    let failedRenewalInvoice = await invoice(
      identifier(failedRenewalSub.latest_invoice),
    );
    if (failedRenewalInvoice.status === 'draft') {
      await advance(upgrade.clock, upgrade.end + 7400);
      failedRenewalSub = await stripe.subscriptions.retrieve(upgrade.sub);
      failedRenewalInvoice = await invoice(
        identifier(failedRenewalSub.latest_invoice),
      );
    }
    assert.equal(failedRenewalInvoice.status, 'open');
    assert.equal(failedRenewalInvoice.amount_due, products[1].cents);
    await applyInvoice(
      failedRenewalInvoice.id,
      'invoice.payment_failed',
      upgrade.end + 7400,
    );
    assert.equal(
      (await db.membership.findUniqueOrThrow({ where: { id: upgrade.id } }))
        .status,
      'PAST_DUE',
    );
    assert.equal(
      (
        await db.creditAccount.findUniqueOrThrow({ where: { id: upgrade.id } })
      ).validUntil?.getTime(),
      upgrade.end * 1000,
    );
    await stripe.invoices.pay(failedRenewalInvoice.id, {
      payment_method: upgrade.pm,
    });
    await applyInvoice(
      failedRenewalInvoice.id,
      'invoice.paid',
      upgrade.end + 7401,
    );
    assert.equal(
      (await db.membership.findUniqueOrThrow({ where: { id: upgrade.id } }))
        .status,
      'ACTIVE',
    );
    await verifyApplied(upgrade, 1, 8);
    console.log(
      'PASS failed renewal: no new paid period/access until retry succeeds; correct renewed credits',
    );

    const downgrade = await fixture(1);
    const downgraded = await change(downgrade, 0);
    assert.equal(downgraded.result.status, 'APPLIED');
    await verifyApplied(downgrade, 0, 2);
    console.log(
      'PASS immediate downgrade: credit adjustment, original renewal anchor, 4 minus 2 used credits',
    );

    const scheduled = await fixture(0);
    const date = new Date((middle + 2 * 86400) * 1000)
      .toISOString()
      .slice(0, 10);
    const future = await change(scheduled, 1, 'DATE', date);
    assert.equal(future.result.status, 'SCHEDULED');
    assert.equal(
      (await db.membership.findUniqueOrThrow({ where: { id: scheduled.id } }))
        .productId,
      products[0].id,
    );
    await advance(
      scheduled.clock,
      Math.floor(future.quote.effectiveAt.getTime() / 1000) + 3700,
    );
    const scheduledSub = await stripe.subscriptions.retrieve(scheduled.sub);
    const scheduledInvoice = await applyInvoice(
      identifier(scheduledSub.latest_invoice),
      'invoice.paid',
      Math.floor(future.quote.effectiveAt.getTime() / 1000) + 3700,
    );
    assert.equal(scheduledInvoice.status, 'paid');
    await verifyApplied(scheduled, 1, 6);
    console.log(
      'PASS chosen-date phase transition: paid proration and unchanged renewal anchor',
    );

    const renewal = await fixture(0);
    const next = await change(renewal, 1, 'NEXT_RENEWAL');
    assert.equal(next.result.status, 'SCHEDULED');
    await advance(renewal.clock, renewal.end + 3700);
    let renewSub = await stripe.subscriptions.retrieve(renewal.sub);
    let renewInvoice = await invoice(identifier(renewSub.latest_invoice));
    if (renewInvoice.status === 'draft') {
      await advance(renewal.clock, renewal.end + 7400);
      renewSub = await stripe.subscriptions.retrieve(renewal.sub);
      renewInvoice = await invoice(identifier(renewSub.latest_invoice));
    }
    assert.equal(renewInvoice.status, 'paid');
    assert.equal(renewInvoice.amount_paid, products[1].cents);
    await applyInvoice(renewInvoice.id, 'invoice.paid', renewal.end + 7400);
    await verifyApplied(renewal, 1, 8);
    console.log(
      'PASS next renewal: exact new monthly price charged and full new allowance',
    );

    const failure = await fixture(0);
    const declined = await stripe.paymentMethods.attach(
      'pm_card_chargeCustomerFail',
      { customer: failure.customer },
    );
    await stripe.subscriptions.update(failure.sub, {
      default_payment_method: declined.id,
    });
    const failed = await change(failure, 1);
    assert.equal(failed.result.status, 'AWAITING_PAYMENT');
    assert.equal(
      (await db.membership.findUniqueOrThrow({ where: { id: failure.id } }))
        .productId,
      products[0].id,
    );
    await stripe.subscriptions.update(failure.sub, {
      default_payment_method: failure.pm,
    });
    await stripe.invoices.pay(failed.result.stripeInvoiceId!, {
      payment_method: failure.pm,
    });
    const recovered = await applyInvoice(
      failed.result.stripeInvoiceId!,
      'invoice.paid',
      middle + 60,
    );
    await verifyApplied(failure, 1, 6);
    await applyInvoice(recovered.id, 'invoice.paid', middle + 61);
    await verifyApplied(failure, 1, 6);
    console.log(
      'PASS failed payment/recovery: no unpaid upgrade, paid retry restores access exactly once',
    );

    const payment = recovered.payments?.data.find(
      (entry) => entry.payment.type === 'payment_intent',
    );
    const intentId = identifier(payment?.payment.payment_intent);
    assert.ok(intentId);
    const refund = await stripe.refunds.create({ payment_intent: intentId });
    assert.equal(refund.status, 'succeeded');
    const charge = await stripe.charges.retrieve(identifier(refund.charge));
    await db.$transaction((tx) =>
      processStripeEvent(tx, {
        id: `${run}:refund`,
        object: 'event',
        api_version: null,
        created: middle + 120,
        data: { object: charge },
        livemode: false,
        pending_webhooks: 0,
        request: null,
        type: 'charge.refunded',
      } as Stripe.Event),
    );
    assert.equal(
      (await db.membership.findUniqueOrThrow({ where: { id: failure.id } }))
        .status,
      'PAST_DUE',
    );
    assert.equal(
      (
        await db.paymentRecord.findUniqueOrThrow({
          where: { stripePaymentIntentId: intentId },
        })
      ).status,
      'REFUNDED',
    );
    console.log(
      'PASS real TEST refund: financial record updated and reversed current funding restricts access',
    );
  } finally {
    const cleanupFailures: string[] = [];
    for (const clock of clocks) {
      try {
        await stripe.testHelpers.testClocks.del(clock);
      } catch {
        cleanupFailures.push(`clock ${clock}`);
      }
    }
    for (const product of products) {
      try {
        await stripe.products.update(product.stripeProduct, { active: false });
        assert.equal(
          (await stripe.products.retrieve(product.stripeProduct)).active,
          false,
        );
      } catch {
        cleanupFailures.push(`product ${product.stripeProduct}`);
      }
    }
    await db.$disconnect();
    if (cleanupFailures.length)
      throw Error(
        `TEST fixture cleanup incomplete: ${cleanupFailures.join(', ')}. Run: ${run}`,
      );
    console.log(
      `Test fixtures retained locally for evidence only: ${run}; Stripe test clocks deleted, test products archived.`,
    );
  }
}

main().catch((error) => {
  // Stripe errors can include request objects. Output only a sanitized message.
  console.error(
    String(error?.message || error).replace(
      /(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+/g,
      '[REDACTED]',
    ),
  );
  process.exitCode = 1;
});
