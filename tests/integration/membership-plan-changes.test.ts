import { queueEmail } from '@/lib/notifications/email-queue';
import { grantVipEventCredit } from '@/lib/domain/credits/grant-vip-event-credit';
import { vipMonthlyBenefitWindowForDate } from '@/lib/domain/credits/vip-monthly-benefits';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type Stripe from 'stripe';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  quoteAdminPlanChange,
  confirmAdminPlanChange,
  reconcileAdminPlanChange,
} from '@/lib/payments/admin-plan-change';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { retrySerializableTransaction } from '@/lib/payments/transaction-retry';
import {
  withMembershipBillingLock,
  UncertainBillingChangeError,
} from '@/lib/domain/memberships/billing-lock';
import { lockMembershipEntitlements } from '@/lib/domain/credits/entitlement-lock';
import { cancellationPolicyDecision } from '@/lib/domain/bookings/cancellation-policy';
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: vi.fn() }));

const url = process.env.PLAN_CHANGE_TEST_DATABASE_URL;
if (
  url &&
  (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/membership_plan_test')
)
  throw Error('Use disposable local membership_plan_test only');
const start = Date.parse('2026-09-03T16:00Z') / 1000;
const end = Date.parse('2026-10-03T16:00Z') / 1000;
const now = new Date('2026-09-21T18:00Z');
describe.skipIf(!url)('Stripe-backed admin membership changes', () => {
  const db = new PrismaClient({ datasourceUrl: url });
  const prefix = `plan-change-test-${randomUUID()}`;
  afterAll(async () => {
    await db.booking.deleteMany({ where: { userId: { startsWith: prefix } } });
    await db.classOccurrence.deleteMany({
      where: { id: { startsWith: prefix } },
    });
    await db.classTemplate.deleteMany({
      where: { id: { startsWith: prefix } },
    });
    await db.classCategory.deleteMany({
      where: { id: { startsWith: prefix } },
    });
    await db.auditLog.deleteMany({
      where: { entityId: { startsWith: prefix } },
    });
    await db.inAppNotification.deleteMany({
      where: { userId: { startsWith: prefix } },
    });
    await db.paymentRecord.deleteMany({
      where: { userId: { startsWith: prefix } },
    });
    await db.membershipPlanChange.deleteMany({
      where: { membershipId: { startsWith: prefix } },
    });
    await db.creditLedgerEntry.deleteMany({
      where: { creditAccount: { userId: { startsWith: prefix } } },
    });
    await db.creditAccount.deleteMany({
      where: { userId: { startsWith: prefix } },
    });
    await db.membership.deleteMany({
      where: { userId: { startsWith: prefix } },
    });
    await db.purchase.deleteMany({ where: { userId: { startsWith: prefix } } });
    await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.product.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.$disconnect();
  });
  async function fixture() {
    const id = `${prefix}-${randomUUID()}`;
    await db.user.create({
      data: { id, email: `${id}@example.test`, stripeCustomerId: `cus_${id}` },
    });
    for (const [suffix, credits, price] of [
      ['old', 4, 9200],
      ['new', 8, 11900],
    ] as const) {
      await db.product.create({
        data: {
          id: `${id}-${suffix}`,
          name: `Synthetic ${suffix}`,
          slug: `${id}-${suffix}`,
          description: 'Test only',
          kind: 'LIMITED_MEMBERSHIP',
          priceCents: price,
          billingInterval: 'MONTHLY',
          includedCredits: credits,
          stripePriceId: `price_${suffix}_${id}`,
          eligibleCategoryIds: [],
        },
      });
    }
    await db.purchase.create({
      data: {
        id,
        userId: id,
        productId: `${id}-old`,
        status: 'PAID',
        amountCents: 9200,
        paidAt: new Date(start * 1000),
        stripePaymentIntentId: `pi_original_${id}`,
      },
    });
    await db.membership.create({
      data: {
        id,
        userId: id,
        productId: `${id}-old`,
        purchaseId: id,
        stripeSubscriptionId: `sub_${id}`,
        status: 'ACTIVE',
        currentPeriodStart: new Date(start * 1000),
        currentPeriodEnd: new Date(end * 1000),
      },
    });
    await db.creditAccount.create({
      data: {
        id,
        userId: id,
        sourcePurchaseId: id,
        label: 'Synthetic old',
        validFrom: new Date(start * 1000),
        validUntil: new Date(end * 1000),
        entries: {
          create: [
            { type: 'GRANT', quantity: 4, createdAt: new Date(start * 1000) },
            {
              type: 'RESERVE',
              quantity: -2,
              createdAt: new Date((start + 50) * 1000),
            },
          ],
        },
      },
    });
    const price = (suffix: string) => ({
      id: `price_${suffix}_${id}`,
      product: `prod_${suffix}_${id}`,
      active: true,
      currency: 'usd',
      unit_amount: suffix === 'old' ? 9200 : 11900,
      recurring: {
        interval: 'month',
        interval_count: 1,
        usage_type: 'licensed',
      },
      type: 'recurring',
    });
    const subscription = {
      id: `sub_${id}`,
      customer: `cus_${id}`,
      status: 'active',
      cancel_at_period_end: false,
      pause_collection: null,
      pending_update: null,
      schedule: null,
      discounts: [],
      default_tax_rates: [],
      automatic_tax: { enabled: false },
      collection_method: 'charge_automatically',
      billing_cycle_anchor: start,
      metadata: {},
      latest_invoice: {
        id: `in_original_${id}`,
        status: 'paid',
        status_transitions: { paid_at: start + 10 },
      },
      items: {
        data: [
          {
            id: `si_${id}`,
            quantity: 1,
            current_period_start: start,
            current_period_end: end,
            price: price('old'),
            discounts: [],
            tax_rates: [],
          },
        ],
      },
    };
    const preview = {
      amount_due: 1072,
      total: 1072,
      currency: 'usd',
      lines: { data: [] },
    };
    const coupons = new Map<string, Record<string, unknown>>();
    const stripe = {
      coupons: {
        create: vi.fn(async (input: Stripe.CouponCreateParams) => {
          const coupon = {
            id: `coupon_${randomUUID()}`,
            valid: true,
            ...input,
          };
          coupons.set(coupon.id, coupon);
          return coupon;
        }),
        retrieve: vi.fn(
          async (id: string, params?: Stripe.CouponRetrieveParams) => {
            const coupon = coupons.get(id);
            // Stripe omits this product restriction unless explicitly expanded.
            if (!coupon || params?.expand?.includes('applies_to'))
              return coupon;
            return { ...coupon, applies_to: undefined };
          },
        ),
      },
      subscriptions: {
        retrieve: vi.fn(async () => subscription),
        update: vi.fn(
          async (_id: string, input: Stripe.SubscriptionUpdateParams) =>
            input.items
              ? {
                  ...subscription,
                  pending_update: { expires_at: end },
                  latest_invoice: { id: `in_change_${id}`, status: 'open' },
                }
              : subscription,
        ),
      },
      prices: { retrieve: vi.fn(async () => price('new')) },
      invoices: {
        createPreview: vi.fn(async () => preview),
        retrieve: vi.fn(async () => ({
          id: `in_change_${id}`,
          status: 'open',
        })),
      },
      subscriptionSchedules: {
        create: vi.fn(async () => ({ id: `sched_${id}` })),
        update: vi.fn(async () => ({ id: `sched_${id}` })),
      },
    };
    const input = {
      userId: id,
      membershipId: id,
      productId: `${id}-new`,
      timing: 'NOW',
      date: '',
      actorId: id,
    };
    const quote = () =>
      quoteAdminPlanChange(db, stripe as unknown as Stripe, input, now);
    const confirm = (quoteId: string) =>
      confirmAdminPlanChange(
        db,
        stripe as unknown as Stripe,
        { quoteId, userId: id, actorId: id },
        now,
      );
    const invoice = (
      suffix: string,
      reason = 'subscription_update',
      periodStart = Math.floor(now.getTime() / 1000),
      periodEnd = end,
    ) => ({
      id: `in_${suffix}_${id}`,
      subscription: `sub_${id}`,
      customer: `cus_${id}`,
      status: 'paid',
      amount_paid: 1072,
      amount_due: 1072,
      total: 1072,
      currency: 'usd',
      billing_reason: reason,
      status_transitions: { paid_at: periodStart + 5 },
      payment_intent: `pi_${suffix}_${id}`,
      lines: {
        has_more: false,
        data: [
          {
            type: 'subscription',
            quantity: 1,
            subscription_item: `si_${id}`,
            price: price('new'),
            proration: reason === 'subscription_update',
            amount: 1072,
            period: { start: periodStart, end: periodEnd },
          },
        ],
      },
    });
    const event = (object: unknown, type = 'invoice.paid') =>
      ({
        id: `evt_${randomUUID()}`,
        type,
        created: Math.floor(now.getTime() / 1000) + 5,
        data: { object },
      }) as Stripe.Event;
    const process = (value: Stripe.Event) =>
      retrySerializableTransaction(() =>
        db.$transaction((tx) => processStripeEvent(tx, value), {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 10000,
        }),
      );
    return {
      id,
      stripe,
      subscription,
      preview,
      input,
      quote,
      confirm,
      invoice,
      event,
      process,
    };
  }
  it('starts a new full paid month only after the reset invoice succeeds and only once', async () => {
    const f = await fixture();
    f.preview.amount_due = 11900;
    f.preview.total = 11900;
    const q = await quoteAdminPlanChange(
      db,
      f.stripe as unknown as Stripe,
      { ...f.input, resetBillingCycle: true },
      now,
    );
    expect(q.quote).toMatchObject({
      resetBillingCycle: true,
      chargeCents: 11900,
    });
    await f.confirm(q.id);
    expect(f.stripe.subscriptions.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        billing_cycle_anchor: 'now',
        proration_behavior: 'none',
        payment_behavior: 'pending_if_incomplete',
      }),
      expect.anything(),
    );
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } }))
        .productId,
    ).toBe(`${f.id}-old`);
    const paidStart = Math.floor(now.getTime() / 1000) + 10;
    const paidEnd = Date.parse('2026-10-21T18:00:10Z') / 1000;
    const invoice = f.invoice(
      'change',
      'subscription_update',
      paidStart,
      paidEnd,
    );
    invoice.lines.data[0].proration = false;
    invoice.lines.data[0].amount = 11900;
    invoice.amount_paid = 11900;
    invoice.amount_due = 11900;
    invoice.total = 11900;
    await f.process(f.event(invoice));
    await f.process(f.event(invoice));
    expect(
      await db.membership.findUniqueOrThrow({ where: { id: f.id } }),
    ).toMatchObject({
      productId: `${f.id}-new`,
      status: 'ACTIVE',
      currentPeriodStart: new Date(paidStart * 1000),
      currentPeriodEnd: new Date(paidEnd * 1000),
    });
    expect(
      await db.membershipPlanChange.findUniqueOrThrow({ where: { id: q.id } }),
    ).toMatchObject({ status: 'APPLIED' });
    expect(
      await db.paymentRecord.count({ where: { stripeInvoiceId: invoice.id } }),
    ).toBe(1);
    expect(
      await db.creditLedgerEntry.count({
        where: { sourceStripeInvoiceId: invoice.id },
      }),
    ).toBe(1);
  });
  it.each([
    'unbound',
    'wrong-invoice',
    'zero-paid',
    'wrong-item',
    'wrong-period',
    'early-period',
    'extra-line',
  ])(
    'rejects an unverified reset receipt: %s, without recording payment or granting access',
    async (problem) => {
      const f = await fixture();
      f.preview.amount_due = f.preview.total = 11900;
      const q = await quoteAdminPlanChange(
        db,
        f.stripe as unknown as Stripe,
        { ...f.input, resetBillingCycle: true },
        now,
      );
      await f.confirm(q.id);
      const invoice = f.invoice(
        'change',
        'subscription_update',
        Math.floor(now.getTime() / 1000) + 10,
        Date.parse('2026-10-21T18:00:10Z') / 1000,
      );
      invoice.lines.data[0].proration = false;
      invoice.amount_paid = invoice.amount_due = invoice.total = 11900;
      if (problem === 'unbound')
        await db.membershipPlanChange.update({
          where: { id: q.id },
          data: { stripeInvoiceId: null },
        });
      if (problem === 'wrong-invoice') invoice.id += '-unrelated';
      if (problem === 'zero-paid')
        invoice.amount_paid = invoice.amount_due = invoice.total = 0;
      if (problem === 'wrong-item')
        invoice.lines.data[0].subscription_item = 'si_other';
      if (problem === 'wrong-period') invoice.lines.data[0].period.end += 86400;
      if (problem === 'early-period') {
        invoice.lines.data[0].period.start -= 86400;
        invoice.lines.data[0].period.end -= 86400;
      }
      if (problem === 'extra-line')
        invoice.lines.data.push({ ...invoice.lines.data[0] });
      await expect(f.process(f.event(invoice))).rejects.toThrow(
        /reset invoice|ambiguous/i,
      );
      expect(
        (await db.membership.findUniqueOrThrow({ where: { id: f.id } }))
          .productId,
      ).toBe(`${f.id}-old`);
      expect(
        await db.paymentRecord.count({
          where: { stripeInvoiceId: invoice.id },
        }),
      ).toBe(0);
      if (problem === 'unbound') {
        await db.membershipPlanChange.update({
          where: { id: q.id },
          data: { stripeInvoiceId: invoice.id },
        });
        await f.process(f.event(invoice));
        expect(
          (
            await db.membershipPlanChange.findUniqueOrThrow({
              where: { id: q.id },
            })
          ).status,
        ).toBe('APPLIED');
      }
    },
  );
  it('grants exactly one calendar-month event credit after a paid VIP upgrade', async () => {
    const f = await fixture();
    await db.product.update({
      where: { id: `${f.id}-new` },
      data: { kind: 'VIP', isUnlimited: true, includedCredits: null },
    });
    f.preview.amount_due = 11900;
    f.preview.total = 11900;
    const q = await quoteAdminPlanChange(
      db,
      f.stripe as unknown as Stripe,
      { ...f.input, resetBillingCycle: true },
      now,
    );
    await f.confirm(q.id);
    expect(
      await db.creditAccount.count({
        where: { userId: f.id, sourcePurchaseId: null },
      }),
    ).toBe(0);
    const invoice = f.invoice(
      'change',
      'subscription_update',
      Math.floor(now.getTime() / 1000) + 10,
      Date.parse('2026-10-21T18:00:10Z') / 1000,
    );
    invoice.lines.data[0].proration = false;
    invoice.lines.data[0].amount = 11900;
    invoice.amount_paid = 11900;
    invoice.amount_due = 11900;
    invoice.total = 11900;
    await f.process(f.event(invoice));
    await f.process(f.event(invoice));
    await Promise.all([
      grantVipEventCredit(db, f.id, vipMonthlyBenefitWindowForDate(now)),
      grantVipEventCredit(db, f.id, vipMonthlyBenefitWindowForDate(now)),
    ]);
    const accounts = await db.creditAccount.findMany({
      where: { userId: f.id },
      include: { entries: true },
    });
    expect(accounts.find((a) => a.sourcePurchaseId === f.id)?.isUnlimited).toBe(
      true,
    );
    const eventAccounts = accounts.filter((a) => !a.sourcePurchaseId);
    expect(eventAccounts).toHaveLength(1);
    expect(eventAccounts[0].label).toContain(
      'September 2026 VIP complimentary event credit',
    );
    expect(eventAccounts[0].entries.reduce((n, e) => n + e.quantity, 0)).toBe(
      1,
    );
  });
  it('preserves a legacy event grant when its old UTC boundary differs', async () => {
    const f = await fixture();
    const window = vipMonthlyBenefitWindowForDate(
      new Date('2026-12-15T12:00Z'),
    );
    await db.creditAccount.create({
      data: {
        userId: f.id,
        label: window.eventCreditLabel,
        validFrom: new Date('2026-12-01T04:00Z'),
        validUntil: new Date('2027-01-01T04:00Z'),
        entries: {
          create: {
            type: 'GRANT',
            quantity: 1,
            reason: 'Legacy monthly benefit',
          },
        },
      },
    });
    expect(await grantVipEventCredit(db, f.id, window)).toBe(false);
    expect(
      await db.creditAccount.count({
        where: { userId: f.id, sourcePurchaseId: null },
      }),
    ).toBe(1);
  });
  it('does not submit a new-month charge when preview is not the exact full monthly amount', async () => {
    const f = await fixture();
    await expect(
      quoteAdminPlanChange(
        db,
        f.stripe as unknown as Stripe,
        { ...f.input, resetBillingCycle: true },
        now,
      ),
    ).rejects.toThrow(/full monthly/);
    expect(f.stripe.subscriptions.update).not.toHaveBeenCalled();
  });
  it('reviews a legacy promotion and requires explicit replacement confirmation', async () => {
    const f = await fixture();
    const legacy = {
      id: 'legacy',
      name: 'RHYZE2026',
      percent_off: 20,
      amount_off: null,
      currency: null,
      duration: 'repeating',
      duration_in_months: 2,
      metadata: {},
    };
    (f.subscription.discounts as unknown[]) = [
      { id: 'di_legacy', source: { coupon: 'legacy' }, start, end },
    ];
    const originalRetrieve = f.stripe.coupons.retrieve.getMockImplementation()!;
    f.stripe.coupons.retrieve.mockImplementation(async (id, params) =>
      id === 'legacy' ? legacy : originalRetrieve(id, params),
    );
    const q = await quoteAdminPlanChange(
      db,
      f.stripe as unknown as Stripe,
      {
        ...f.input,
        monthlyPrice: '99',
        discountDuration: 'forever',
        discountReason: 'Owner lifetime offer',
      },
      now,
    );
    expect(q.quote).toMatchObject({
      requiresDiscountReplacement: true,
      existingDiscountLabel: 'RHYZE2026: 20% off for 2 months',
    });
    await expect(f.confirm(q.id)).rejects.toThrow(/confirm.*replac/i);
    expect(
      (await db.membershipPlanChange.findUniqueOrThrow({ where: { id: q.id } }))
        .status,
    ).toBe('QUOTED');
    await confirmAdminPlanChange(
      db,
      f.stripe as unknown as Stripe,
      {
        quoteId: q.id,
        userId: f.id,
        actorId: f.id,
        replaceExistingDiscount: true,
      },
      now,
    );
    expect(
      (await db.membershipPlanChange.findUniqueOrThrow({ where: { id: q.id } }))
        .status,
    ).toBe('AWAITING_PAYMENT');
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } }))
        .productId,
    ).toBe(`${f.id}-old`);
  });
  it('refuses changed legacy discount terms after review before submitting payment', async () => {
    const f = await fixture();
    const legacy = {
      id: 'legacy',
      name: 'RHYZE2026',
      percent_off: 20,
      amount_off: null,
      currency: null,
      duration: 'repeating',
      duration_in_months: 2,
      metadata: {},
    };
    (f.subscription.discounts as unknown[]) = [
      { id: 'di_legacy', source: { coupon: 'legacy' }, start, end },
    ];
    const originalRetrieve = f.stripe.coupons.retrieve.getMockImplementation()!;
    f.stripe.coupons.retrieve.mockImplementation(async (id, params) =>
      id === 'legacy' ? legacy : originalRetrieve(id, params),
    );
    const q = await quoteAdminPlanChange(
      db,
      f.stripe as unknown as Stripe,
      {
        ...f.input,
        monthlyPrice: '99',
        discountDuration: 'forever',
        discountReason: 'Owner lifetime offer',
      },
      now,
    );
    legacy.percent_off = 30;
    await expect(
      confirmAdminPlanChange(
        db,
        f.stripe as unknown as Stripe,
        {
          quoteId: q.id,
          userId: f.id,
          actorId: f.id,
          replaceExistingDiscount: true,
        },
        now,
      ),
    ).rejects.toThrow(/discount changed/i);
    expect(
      (await db.membershipPlanChange.findUniqueOrThrow({ where: { id: q.id } }))
        .status,
    ).toBe('QUOTED');
    expect(f.stripe.subscriptions.update).not.toHaveBeenCalled();
  });
  it('reviews a timed client discount and applies the same coupon once without unpaid access', async () => {
    const f = await fixture();
    const q = await quoteAdminPlanChange(
      db,
      f.stripe as unknown as Stripe,
      {
        ...f.input,
        monthlyPrice: '99',
        discountDuration: 'repeating',
        discountMonths: '3',
        discountReason: 'Owner approved',
      },
      now,
    );
    expect(q.quote).toMatchObject({
      monthlyCents: 9900,
      pricing: { amountOff: 2000, months: 3 },
    });
    expect(f.stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(f.stripe.coupons.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_off: 2000,
        max_redemptions: 1,
        duration_in_months: 3,
        applies_to: { products: [`prod_new_${f.id}`] },
      }),
      expect.anything(),
    );
    const couponId = (q.quote as { couponId: string }).couponId;
    expect(f.stripe.invoices.createPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ discounts: [{ coupon: couponId }] }),
    );
    await f.confirm(q.id);
    await f.confirm(q.id);
    expect(f.stripe.subscriptions.update).toHaveBeenCalledTimes(1);
    expect(f.stripe.subscriptions.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        discounts: [{ coupon: couponId }],
        payment_behavior: 'pending_if_incomplete',
      }),
      expect.anything(),
    );
    expect(
      await db.membership.findUnique({ where: { id: f.id } }),
    ).toMatchObject({ productId: `${f.id}-old` });
  });
  it('places future discounts only on the changed phase and retains their duration', async () => {
    const f = await fixture();
    const q = await quoteAdminPlanChange(
      db,
      f.stripe as unknown as Stripe,
      {
        ...f.input,
        timing: 'NEXT_RENEWAL',
        monthlyPrice: '99',
        discountDuration: 'forever',
        discountReason: 'Owner approved',
      },
      now,
    );
    await f.confirm(q.id);
    expect(f.stripe.subscriptionSchedules.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        phases: [
          expect.objectContaining({ discounts: [] }),
          expect.objectContaining({
            discounts: [{ coupon: (q.quote as { couponId: string }).couponId }],
          }),
        ],
      }),
      expect.anything(),
    );
  });
  it('schedules a price-only change at renewal without replacing the plan or granting credits', async () => {
    const f = await fixture();
    f.stripe.prices.retrieve.mockResolvedValue(
      f.subscription.items.data[0].price,
    );
    const input = {
      ...f.input,
      productId: `${f.id}-old`,
      monthlyPrice: '79',
      discountDuration: 'forever',
      discountReason: 'Owner offer',
    };
    await expect(
      quoteAdminPlanChange(db, f.stripe as unknown as Stripe, input, now),
    ).rejects.toThrow(/next renewal/);
    const q = await quoteAdminPlanChange(
      db,
      f.stripe as unknown as Stripe,
      { ...input, timing: 'NEXT_RENEWAL' },
      now,
    );
    await f.confirm(q.id);
    expect(f.stripe.subscriptions.update).not.toHaveBeenCalled();
    expect(f.stripe.subscriptionSchedules.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        phases: [
          expect.objectContaining({
            items: [{ price: `price_old_${f.id}`, quantity: 1 }],
          }),
          expect.objectContaining({
            items: [{ price: `price_old_${f.id}`, quantity: 1 }],
            discounts: [{ coupon: (q.quote as { couponId: string }).couponId }],
          }),
        ],
      }),
      expect.anything(),
    );
    expect(
      await db.creditLedgerEntry.count({ where: { creditAccountId: f.id } }),
    ).toBe(2);
  });
  it('refuses changed coupon terms and invalid pricing before any charge', async () => {
    const f = await fixture();
    await expect(
      quoteAdminPlanChange(
        db,
        f.stripe as unknown as Stripe,
        {
          ...f.input,
          monthlyPrice: '999',
          discountDuration: 'forever',
          discountReason: 'Owner approved',
        },
        now,
      ),
    ).rejects.toThrow(/price/);
    expect(f.stripe.coupons.create).not.toHaveBeenCalled();
    const q = await quoteAdminPlanChange(
      db,
      f.stripe as unknown as Stripe,
      {
        ...f.input,
        monthlyPrice: '99',
        discountDuration: 'forever',
        discountReason: 'Owner approved',
      },
      now,
    );
    f.stripe.coupons.retrieve.mockResolvedValueOnce({
      valid: true,
      amount_off: 1,
    });
    await expect(f.confirm(q.id)).rejects.toThrow(/discount changed/);
    expect(f.stripe.subscriptions.update).not.toHaveBeenCalled();
  });
  it('quotes without mutating Stripe and confirms once without granting unpaid access', async () => {
    const f = await fixture();
    const q = await f.quote();
    expect(f.stripe.subscriptions.update).not.toHaveBeenCalled();
    await f.confirm(q.id);
    await f.confirm(q.id);
    expect(
      f.stripe.subscriptions.update.mock.calls.filter(([, p]) => p.items),
    ).toHaveLength(1);
    expect(
      await db.membership.findUnique({ where: { id: f.id } }),
    ).toMatchObject({
      productId: `${f.id}-old`,
      currentPeriodEnd: new Date(end * 1000),
    });
    expect(
      await db.membershipPlanChange.findUnique({ where: { id: q.id } }),
    ).toMatchObject({ status: 'AWAITING_PAYMENT' });
  });
  it('rejects customer mismatches, changed quote amounts and stale quotes before billing', async () => {
    const f = await fixture();
    f.subscription.customer = 'cus_other';
    await expect(f.quote()).rejects.toThrow(/customer/i);
    f.subscription.customer = `cus_${f.id}`;
    const q = await f.quote();
    f.preview.amount_due++;
    await expect(f.confirm(q.id)).rejects.toThrow(/quote|amount/i);
    expect(f.stripe.subscriptions.update).not.toHaveBeenCalled();
  });
  it('records paid adjustment once, keeps original purchase intact, and only adds the allowance difference', async () => {
    const f = await fixture();
    const q = await f.quote();
    await f.confirm(q.id);
    const paid = f.event(f.invoice('change'));
    await f.process(paid);
    await f.process({ ...paid, id: `evt_${randomUUID()}` });
    expect(
      await db.membership.findUnique({ where: { id: f.id } }),
    ).toMatchObject({
      productId: `${f.id}-new`,
      currentPeriodStart: new Date(start * 1000),
      currentPeriodEnd: new Date(end * 1000),
    });
    expect(
      (
        await db.creditLedgerEntry.aggregate({
          where: { creditAccountId: f.id },
          _sum: { quantity: true },
        })
      )._sum.quantity,
    ).toBe(6);
    expect(await db.purchase.findUnique({ where: { id: f.id } })).toMatchObject(
      {
        productId: `${f.id}-old`,
        amountCents: 9200,
        stripePaymentIntentId: `pi_original_${f.id}`,
      },
    );
    expect(
      await db.paymentRecord.count({ where: { membershipId: f.id } }),
    ).toBe(1);
    expect(
      await db.paymentRecord.findFirst({ where: { membershipId: f.id } }),
    ).toMatchObject({
      purchaseId: null,
      amountCents: 1072,
      productName: 'Synthetic new — plan adjustment',
    });
  });
  it('next renewal grants the new allowance and late old events do not reset it', async () => {
    const f = await fixture();
    const q = await f.quote();
    await f.confirm(q.id);
    await f.process(f.event(f.invoice('change')));
    const renewal = f.invoice(
      'renew',
      'subscription_cycle',
      end,
      end + 31 * 86400,
    );
    renewal.amount_paid = renewal.amount_due = 11900;
    await f.process(f.event(renewal));
    await f.process(f.event(f.invoice('change')));
    expect(
      (
        await db.creditLedgerEntry.aggregate({
          where: { creditAccountId: f.id },
          _sum: { quantity: true },
        })
      )._sum.quantity,
    ).toBe(8);
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } }))
        .currentPeriodEnd,
    ).toEqual(new Date((end + 31 * 86400) * 1000));
  });
  it.each(['charge.refunded', 'charge.dispute.created'])(
    'restricts access after the current managed payment is fully reversed: %s',
    async (type) => {
      const f = await fixture();
      const q = await f.quote();
      await f.confirm(q.id);
      await f.process(f.event(f.invoice('change')));
      await f.process(
        f.event(
          {
            id: `ch_${f.id}`,
            payment_intent: `pi_change_${f.id}`,
            refunded: true,
            amount_refunded: 1072,
          },
          type,
        ),
      );
      expect(
        (await db.membership.findUniqueOrThrow({ where: { id: f.id } })).status,
      ).toBe('PAST_DUE');
      await f.process(f.event(f.invoice('change')));
      expect(
        (await db.membership.findUniqueOrThrow({ where: { id: f.id } })).status,
      ).toBe('PAST_DUE');
      expect(
        (await db.purchase.findUniqueOrThrow({ where: { id: f.id } })).status,
      ).toBe('PAID');
    },
  );
  it('does not revoke the current paid plan for a partial or older-period refund', async () => {
    const f = await fixture();
    const q = await f.quote();
    await f.confirm(q.id);
    await f.process(f.event(f.invoice('change')));
    await f.process(
      f.event(
        {
          id: `ch_${f.id}`,
          payment_intent: `pi_change_${f.id}`,
          refunded: false,
          amount_refunded: 100,
        },
        'charge.refunded',
      ),
    );
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } })).status,
    ).toBe('ACTIVE');
    await f.process(
      f.event(f.invoice('renew', 'subscription_cycle', end, end + 31 * 86400)),
    );
    await f.process(
      f.event(
        {
          id: `ch_${f.id}`,
          payment_intent: `pi_change_${f.id}`,
          refunded: true,
          amount_refunded: 1072,
        },
        'charge.refunded',
      ),
    );
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } })).status,
    ).toBe('ACTIVE');
  });
  it('does not treat the base payment as historical while a prorated change still depends on it', async () => {
    const f = await fixture();
    await db.paymentRecord.create({
      data: {
        userId: f.id,
        membershipId: f.id,
        purchaseId: f.id,
        kind: 'PRODUCT_PURCHASE',
        status: 'SUCCEEDED',
        amountCents: 9200,
        stripeEventId: `evt_original_${f.id}`,
        stripePaymentIntentId: `pi_original_${f.id}`,
      },
    });
    const q = await f.quote();
    await f.confirm(q.id);
    await f.process(f.event(f.invoice('change')));
    await f.process(
      f.event(
        {
          id: `ch_base_${f.id}`,
          payment_intent: `pi_original_${f.id}`,
          refunded: true,
          amount_refunded: 9200,
        },
        'charge.refunded',
      ),
    );
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } })).status,
    ).toBe('PAST_DUE');
    await f.process(
      f.event(f.invoice('renew', 'subscription_cycle', end, end + 31 * 86400)),
    );
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } })).status,
    ).toBe('ACTIVE');
    await f.process(
      f.event(
        {
          id: `ch_base_${f.id}`,
          payment_intent: `pi_original_${f.id}`,
          refunded: true,
          amount_refunded: 9200,
        },
        'charge.refunded',
      ),
    );
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } })).status,
    ).toBe('ACTIVE');
  });
  it('expires the linked access window even when a managed refund arrives during a pause', async () => {
    const f = await fixture();
    const q = await f.quote();
    await f.confirm(q.id);
    await f.process(f.event(f.invoice('change')));
    await db.membership.update({
      where: { id: f.id },
      data: { status: 'PAUSED' },
    });
    const refund = f.event(
      {
        id: `ch_${f.id}`,
        payment_intent: `pi_change_${f.id}`,
        refunded: true,
        amount_refunded: 1072,
      },
      'charge.refunded',
    );
    await f.process(refund);
    expect(
      (await db.creditAccount.findUniqueOrThrow({ where: { id: f.id } }))
        .validUntil,
    ).toEqual(new Date(refund.created * 1000));
  });
  it('adopts a sync-created payment row before fulfilling the invoice', async () => {
    const f = await fixture();
    const q = await f.quote();
    await f.confirm(q.id);
    await db.paymentRecord.create({
      data: {
        userId: f.id,
        kind: 'PRODUCT_PURCHASE',
        status: 'SUCCEEDED',
        amountCents: 1072,
        stripeEventId: `sync_${f.id}`,
        stripePaymentIntentId: `pi_change_${f.id}`,
      },
    });
    await f.process(f.event(f.invoice('change')));
    expect(await db.paymentRecord.count({ where: { userId: f.id } })).toBe(1);
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } }))
        .productId,
    ).toBe(`${f.id}-new`);
  });
  it('schedules next renewal without changing access or making a second subscription', async () => {
    const f = await fixture();
    f.input.timing = 'NEXT_RENEWAL';
    const q = await f.quote();
    await f.confirm(q.id);
    expect(f.stripe.subscriptionSchedules.create).toHaveBeenCalledWith(
      { from_subscription: `sub_${f.id}` },
      expect.any(Object),
    );
    expect(f.stripe.subscriptionSchedules.update).toHaveBeenCalledWith(
      `sched_${f.id}`,
      expect.objectContaining({ end_behavior: 'release' }),
      expect.any(Object),
    );
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } }))
        .productId,
    ).toBe(`${f.id}-old`);
    expect(
      (await db.membershipPlanChange.findUniqueOrThrow({ where: { id: q.id } }))
        .status,
    ).toBe('SCHEDULED');
  });
  it('accepts a legacy paid period whose stored start was the invoice paid timestamp', async () => {
    const f = await fixture();
    await db.membership.update({
      where: { id: f.id },
      data: { currentPeriodStart: new Date((start + 20) * 1000) },
    });
    const q = await f.quote();
    expect(q.periodStart).toEqual(new Date(start * 1000));
  });
  it('does not reactivate a sync-refunded adjustment when its paid invoice arrives later', async () => {
    const f = await fixture();
    const q = await f.quote();
    await f.confirm(q.id);
    await db.paymentRecord.create({
      data: {
        userId: f.id,
        kind: 'PRODUCT_PURCHASE',
        status: 'REFUNDED',
        amountCents: 1072,
        refundedAmountCents: 1072,
        stripeEventId: `refund-sync-${f.id}`,
        stripePaymentIntentId: `pi_change_${f.id}`,
      },
    });
    await f.process(f.event(f.invoice('change')));
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } }))
        .productId,
    ).toBe(`${f.id}-old`);
    expect(
      await db.paymentRecord.findFirst({ where: { userId: f.id } }),
    ).toMatchObject({
      status: 'REFUNDED',
      stripeInvoiceId: `in_change_${f.id}`,
    });
  });
  it('recovers an uncertain Stripe response with the same saved idempotency key', async () => {
    const f = await fixture();
    const q = await f.quote();
    f.stripe.subscriptions.update.mockRejectedValueOnce(
      new Error('connection lost'),
    );
    await expect(f.confirm(q.id)).rejects.toThrow(/review/);
    await reconcileAdminPlanChange(
      db,
      f.stripe as unknown as Stripe,
      { quoteId: q.id, userId: f.id, actorId: f.id },
      now,
    );
    expect(
      (await db.membershipPlanChange.findUniqueOrThrow({ where: { id: q.id } }))
        .status,
    ).toBe('AWAITING_PAYMENT');
    expect(f.stripe.subscriptions.update.mock.calls[0]).toEqual(
      f.stripe.subscriptions.update.mock.calls[1],
    );
  });
  it('does not blindly retry after the Stripe idempotency window', async () => {
    const f = await fixture();
    const q = await f.quote();
    f.stripe.subscriptions.update.mockRejectedValueOnce(
      new Error('connection lost'),
    );
    await expect(f.confirm(q.id)).rejects.toThrow(/review/);
    await expect(
      reconcileAdminPlanChange(
        db,
        f.stripe as unknown as Stripe,
        { quoteId: q.id, userId: f.id, actorId: f.id },
        new Date(now.getTime() + 24 * 3600000),
      ),
    ).rejects.toThrow(/expired|manual/i);
    expect(f.stripe.subscriptions.update.mock.calls).toHaveLength(1);
  });
  it('does not count a credit returned from a previous billing period as unused current allowance', async () => {
    const f = await fixture();
    await db.creditLedgerEntry.createMany({
      data: [
        {
          creditAccountId: f.id,
          bookingId: 'old-booking',
          type: 'RESERVE',
          quantity: -1,
          createdAt: new Date((start - 100) * 1000),
        },
        {
          creditAccountId: f.id,
          bookingId: 'old-booking',
          type: 'RELEASE',
          quantity: 1,
          createdAt: new Date((start + 100) * 1000),
        },
      ],
    });
    const q = await f.quote();
    await f.confirm(q.id);
    await f.process(f.event(f.invoice('change')));
    expect(
      (
        await db.creditLedgerEntry.aggregate({
          where: { creditAccountId: f.id },
          _sum: { quantity: true },
        })
      )._sum.quantity,
    ).toBe(6);
  });
  it('retains durable ownership after an uncertain remote write and permits only explicit same-operation recovery', async () => {
    const f = await fixture();
    await expect(
      withMembershipBillingLock(
        db,
        f.id,
        async () => {
          throw new UncertainBillingChangeError('uncertain');
        },
        { key: 'saved-operation' },
      ),
    ).rejects.toThrow('uncertain');
    await expect(
      withMembershipBillingLock(db, f.id, async () => 'wrong-operation'),
    ).rejects.toThrow(/billing|progress/i);
    const result = await withMembershipBillingLock(
      db,
      f.id,
      async () => 'recovered',
      { key: 'saved-operation', recover: true },
    );
    expect(result).toBe('recovered');
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } }))
        .billingLockToken,
    ).toBeNull();
  });
  it('imports Somble ordering markers so a stale pause cannot revoke a newer paid period', async () => {
    const f = await fixture();
    await db.purchase.update({
      where: { id: f.id },
      data: {
        policyAcceptance: {
          lastPaidAt: start + 100,
          lastLifecycleEventAt: start + 90,
          lastRestrictiveEventAt: start - 1000,
        },
      },
    });
    const q = await f.quote();
    await f.confirm(q.id);
    await f.process({
      ...f.event(
        {
          id: `sub_${f.id}`,
          customer: `cus_${f.id}`,
          status: 'active',
          pause_collection: { behavior: 'void' },
        },
        'customer.subscription.updated',
      ),
      created: start + 80,
    });
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } })).status,
    ).toBe('ACTIVE');
  });
  it('counts unlimited bookings when switching to a limited plan, excluding cancelled bookings', async () => {
    const f = await fixture();
    await db.product.update({
      where: { id: `${f.id}-old` },
      data: { kind: 'VIP', isUnlimited: true, includedCredits: null },
    });
    await db.creditAccount.update({
      where: { id: f.id },
      data: { isUnlimited: true },
    });
    await db.creditLedgerEntry.deleteMany({ where: { creditAccountId: f.id } });
    await db.classCategory.create({
      data: { id: f.id, name: 'Test', slug: f.id },
    });
    await db.classTemplate.create({
      data: {
        id: f.id,
        categoryId: f.id,
        name: 'Test class',
        slug: f.id,
        description: 'Synthetic',
        durationMinutes: 50,
        defaultCapacity: 25,
        tags: [],
        equipment: [],
      },
    });
    for (let i = 0; i < 4; i++) {
      await db.classOccurrence.create({
        data: {
          id: `${f.id}-${i}`,
          templateId: f.id,
          startAt: now,
          endAt: new Date(now.getTime() + 3000000),
          capacity: 25,
        },
      });
      await db.booking.create({
        data: {
          userId: f.id,
          occurrenceId: `${f.id}-${i}`,
          createdAt: new Date((start + 1000) * 1000),
          status: i === 3 ? 'CANCELLED' : 'CONFIRMED',
          policySnapshot: { creditAccountId: f.id, accessType: 'VIP' },
        },
      });
    }
    const q = await f.quote();
    await f.confirm(q.id);
    await f.process(f.event(f.invoice('change')));
    expect(
      (
        await db.creditLedgerEntry.aggregate({
          where: { creditAccountId: f.id },
          _sum: { quantity: true },
        })
      )._sum.quantity,
    ).toBe(5);
    expect(
      (await db.creditAccount.findUniqueOrThrow({ where: { id: f.id } }))
        .isUnlimited,
    ).toBe(false);
    const booking = await db.booking.findFirstOrThrow({
      where: { userId: f.id, status: 'CONFIRMED' },
    });
    const reserve = await db.creditLedgerEntry.findFirst({
      where: { bookingId: booking.id, type: 'RESERVE' },
    });
    expect(reserve?.quantity).toBe(-1);
    const decision = cancellationPolicyDecision({
      startAt: new Date(now.getTime() + 86400000),
      requestedAt: now,
      accessType: 'VIP',
      isEvent: false,
      hasReservedCredit: Boolean(reserve),
    });
    expect(decision.restoreCredit).toBe(true);
    expect(decision.feeCents).toBe(0);
    await db.creditLedgerEntry.create({
      data: {
        creditAccountId: f.id,
        bookingId: booking.id,
        type: 'RELEASE',
        quantity: 1,
      },
    });
    await f.process(f.event(f.invoice('change')));
    expect(
      (
        await db.creditLedgerEntry.aggregate({
          where: { creditAccountId: f.id },
          _sum: { quantity: true },
        })
      )._sum.quantity,
    ).toBe(6);
    expect(
      await db.creditLedgerEntry.count({
        where: { bookingId: booking.id, type: 'RESERVE' },
      }),
    ).toBe(1);
  });
  it('serializes a concurrent credit reservation with plan fulfillment', async () => {
    const f = await fixture();
    const q = await f.quote();
    await f.confirm(q.id);
    let release!: () => void;
    let locked!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const reservation = db.$transaction(async (tx) => {
      await lockMembershipEntitlements(tx, f.id);
      locked();
      await gate;
      await tx.creditLedgerEntry.create({
        data: {
          creditAccountId: f.id,
          type: 'RESERVE',
          quantity: -1,
          createdAt: now,
        },
      });
    });
    await ready;
    let attempts = 0;
    const payment = retrySerializableTransaction(() =>
      db.$transaction(
        async (tx) => {
          attempts++;
          // Force the serializable snapshot to precede the competing booking commit.
          await tx.membership.findUniqueOrThrow({ where: { id: f.id } });
          release();
          await reservation;
          await processStripeEvent(tx, f.event(f.invoice('change')));
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
    await payment;
    expect(attempts).toBe(2);
    expect(
      (
        await db.creditLedgerEntry.aggregate({
          where: { creditAccountId: f.id },
          _sum: { quantity: true },
        })
      )._sum.quantity,
    ).toBe(5);
  });
  it('failed adjustment preserves current paid access and later settlement applies once', async () => {
    const f = await fixture();
    const q = await f.quote();
    await f.confirm(q.id);
    await f.process(
      f.event(
        { ...f.invoice('change'), status: 'open', amount_paid: 0 },
        'invoice.payment_failed',
      ),
    );
    expect(queueEmail).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: f.id, template: 'PAYMENT_FAILED',
      dedupeKey: `payment-failed:${f.invoice('change').id}`,
      payload: expect.objectContaining({ billingUrl: '/sign-in?callbackUrl=%2Fmember%2Fbilling' }),
    }));
    expect(
      await db.membership.findUnique({ where: { id: f.id } }),
    ).toMatchObject({ status: 'ACTIVE', productId: `${f.id}-old` });
    await Promise.all([
      f.process(f.event(f.invoice('change'))),
      f.process(f.event(f.invoice('change'))),
    ]);
    expect(
      (
        await db.creditLedgerEntry.aggregate({
          where: { creditAccountId: f.id },
          _sum: { quantity: true },
        })
      )._sum.quantity,
    ).toBe(6);
  });
  it('zero-dollar paid prorations activate the plan without inventing cash revenue', async () => {
    const f = await fixture();
    const q = await f.quote();
    await f.confirm(q.id);
    await f.process(
      f.event({
        ...f.invoice('change'),
        amount_paid: 0,
        amount_due: 0,
        payment_intent: null,
      }),
    );
    expect(
      await db.paymentRecord.findFirst({ where: { userId: f.id } }),
    ).toMatchObject({ amountCents: 0, status: 'SUCCEEDED' });
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } }))
        .productId,
    ).toBe(`${f.id}-new`);
  });
  it('an old checkout replay does not restore the old membership or mutate its receipt', async () => {
    const f = await fixture();
    const q = await f.quote();
    await f.confirm(q.id);
    await f.process(f.event(f.invoice('change')));
    await f.process(
      f.event(
        {
          id: 'cs_original',
          payment_status: 'paid',
          metadata: { purchaseId: f.id },
          subscription: `sub_${f.id}`,
          customer: `cus_${f.id}`,
          payment_intent: 'pi_wrong',
          created: start,
        },
        'checkout.session.completed',
      ),
    );
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: f.id } }))
        .productId,
    ).toBe(`${f.id}-new`);
    expect(
      (await db.purchase.findUniqueOrThrow({ where: { id: f.id } }))
        .stripePaymentIntentId,
    ).toBe(`pi_original_${f.id}`);
  });
});
