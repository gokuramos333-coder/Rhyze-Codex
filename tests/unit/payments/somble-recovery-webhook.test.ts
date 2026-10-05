import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { processSombleRecoveryEvent } from '@/lib/payments/somble-recovery-webhook';
import { processStripeEvent } from '@/lib/payments/webhook-processor';

const pid = 'somble-september-2026-v1:cms446vaw0069l709pi1gr4yo';
const metadata = {
  recovery: 'somble-september-2026-v1',
  purchaseId: pid,
  userId: 'cmryg3hyo000zw9wrhuigtu3y',
  membershipId: 'cms446vaw0069l709pi1gr4yo',
  productId: 'rhyze-og-tribe-private-2026',
};
function event(type: string, object: any): Stripe.Event {
  return {
    id: 'evt_recovery',
    created: 1790013600,
    type,
    data: { object },
  } as Stripe.Event;
}
function invoice(overrides: any = {}) {
  return {
    id: 'in_first',
    status: 'paid',
    amount_paid: 9200,
    amount_due: 9200,
    currency: 'usd',
    customer: 'cus_verified',
    billing_reason: 'subscription_create',
    parent: {
      subscription_details: { subscription: 'sub_recovered', metadata },
    },
    payments: {
      data: [
        { payment: { type: 'payment_intent', payment_intent: 'pi_first' } },
      ],
    },
    status_transitions: { paid_at: 1790013600 },
    lines: {
      data: [
        {
          amount: 0,
          parent: { type: 'subscription_item_details' },
          period: { start: 1790013600, end: 1791043200 },
        },
        { amount: 9200, period: { start: 1790013600, end: 1790013600 } },
      ],
    },
    ...overrides,
  };
}
function fixture() {
  const state: any = {
    purchase: {
      id: pid,
      userId: metadata.userId,
      productId: metadata.productId,
      status: 'PENDING',
      amountCents: 9200,
      currency: 'usd',
      policyAcceptance: {
        recovery: metadata.recovery,
        membershipId: metadata.membershipId,
        customerId: 'cus_verified',
      },
      product: {
        id: metadata.productId,
        slug: 'og-rhyze-tribe-2026',
        name: 'OG Rhyze Tribe',
        priceCents: 9200,
        kind: 'LIMITED_MEMBERSHIP',
        billingInterval: 'MONTHLY',
        includedCredits: 8,
        isUnlimited: false,
        isActive: true,
        isPublic: false,
      },
    },
    membership: {
      id: metadata.membershipId,
      userId: metadata.userId,
      productId: 'legacy',
      purchaseId: null,
      stripeSubscriptionId: null,
      status: 'ACTIVE',
      currentPeriodStart: new Date('2026-08-03T04:00Z'),
      currentPeriodEnd: new Date('2026-09-03T04:00Z'),
      activatedAt: new Date('2026-07-03T04:00Z'),
      product: {
        id: 'legacy',
        slug: 'somble-og-rhyze-tribe',
        kind: 'LIMITED_MEMBERSHIP',
        billingInterval: 'MONTHLY',
      },
    },
    account: null,
    ledger: [],
    records: [],
    emails: [],
    legacyEntries: [],
    bookings: [],
  };
  const user = {
    id: metadata.userId,
    name: 'Jolie',
    email: 'jolielampkin@gmail.com',
    stripeCustomerId: 'cus_verified',
  };
  const tx: any = {
    $queryRaw: async () => [],
    purchase: {
      findUnique: async () => state.purchase,
      update: async ({ data }: any) => Object.assign(state.purchase, data),
    },
    user: {
      findUnique: async () => ({ ...user, memberships: [state.membership] }),
    },
    membership: {
      findUnique: async () => state.membership,
      findMany: async () => [state.membership],
      update: async ({ data }: any) => Object.assign(state.membership, data),
    },
    booking: { findMany: async () => state.bookings },
    creditAccount: {
      findUnique: async () => state.account,
      upsert: async ({ create, update }: any) => {
        state.account = state.account
          ? { ...state.account, ...update }
          : { ...create, id: 'credit_native', entries: state.ledger };
        return state.account;
      },
      update: async ({ data }: any) => Object.assign(state.account, data),
    },
    creditLedgerEntry: {
      findMany: async () => state.legacyEntries,
      updateMany: async ({ where, data }: any) => {
        const moved = state.legacyEntries.filter((e: any) =>
          where.id.in.includes(e.id),
        );
        for (const entry of moved) {
          Object.assign(entry, data);
          state.ledger.push(entry);
        }
        return { count: moved.length };
      },
      upsert: async ({ create }: any) => {
        const key = create.sourceStripeInvoiceId || create.sourceReturnKey;
        if (
          !state.ledger.some(
            (e: any) => (e.sourceStripeInvoiceId || e.sourceReturnKey) === key,
          )
        )
          state.ledger.push(create);
        return create;
      },
    },
    paymentRecord: {
      findUnique: async ({ where }: any) =>
        state.records.find(
          (r: any) => r.stripePaymentIntentId === where.stripePaymentIntentId,
        ) ?? null,
      findFirst: async ({ where }: any) =>
        state.records.find((r: any) =>
          where.OR.some((w: any) =>
            Object.entries(w).every(([k, v]) => r[k] === v),
          ),
        ),
      create: async ({ data }: any) => {
        state.records.push({ id: `record${state.records.length}`, ...data });
        return data;
      },
      update: async ({ where, data }: any) =>
        Object.assign(
          state.records.find((r: any) => r.id === where.id),
          data,
        ),
    },
    emailMessage: {
      upsert: async ({ create }: any) => {
        state.emails.push(create);
        return create;
      },
    },
  };
  return { tx, state };
}
describe('Somble payment-first fulfillment', () => {
  it('queues a friendly billing email for an unpaid recovered membership invoice', async () => {
    const f = fixture();
    await processSombleRecoveryEvent(f.tx, event('invoice.payment_failed', invoice({
      status: 'open', amount_paid: 0, amount_remaining: 9200,
      status_transitions: { paid_at: null },
    })));
    expect(f.state.emails).toEqual([expect.objectContaining({
      template: 'PAYMENT_FAILED', dedupeKey: 'payment-failed:in_first',
      payload: expect.objectContaining({
        amountCents: 9200, billingUrl: '/sign-in?callbackUrl=%2Fmember%2Fbilling',
      }),
    })]);
  });

  describe('lifecycle event ordering', () => {
    it.each([
      ['paused', 'PAUSED'],
      ['canceled', 'CANCELLED'],
    ])(
      'remembers a newer pending %s without granting access before initial settlement',
      async (status, expected) => {
        const f = fixture();
        const restriction = {
          ...event(
            status === 'canceled'
              ? 'customer.subscription.deleted'
              : 'customer.subscription.updated',
            {
              id: 'sub_recovered',
              customer: 'cus_verified',
              metadata,
              status,
              items: {
                data: [
                  {
                    current_period_start: 1790013600,
                    current_period_end: 1791043200,
                  },
                ],
              },
            },
          ),
          created: 1790013780,
        };
        await processStripeEvent(f.tx, restriction);
        expect(f.state.purchase.status).toBe('PENDING');
        expect(f.state.membership.purchaseId).toBeNull();
        expect(f.state.membership.status).toBe('ACTIVE');
        expect(f.state.account).toBeNull();
        await processStripeEvent(f.tx, event('invoice.paid', invoice()));
        expect(f.state.membership.status).toBe(expected);
        expect(f.state.records).toHaveLength(1);
      },
    );
    const start = new Date('2026-10-03T16:00Z').getTime() / 1000;
    const end = new Date('2026-11-03T16:00Z').getTime() / 1000;
    const paid = () =>
      event(
        'invoice.paid',
        invoice({
          id: 'in_october',
          billing_reason: 'subscription_cycle',
          payments: {
            data: [
              {
                payment: {
                  type: 'payment_intent',
                  payment_intent: 'pi_october',
                },
              },
            ],
          },
          status_transitions: { paid_at: start + 120 },
          lines: {
            data: [
              {
                amount: 9200,
                parent: { type: 'subscription_item_details' },
                period: { start, end },
              },
            ],
          },
        }),
      );
    const snapshot = (status: string, created: number, withPeriod = true) => ({
      ...event(
        status === 'canceled'
          ? 'customer.subscription.deleted'
          : 'customer.subscription.updated',
        {
          id: 'sub_recovered',
          customer: 'cus_verified',
          metadata,
          status,
          cancel_at_period_end: false,
          ...(withPeriod
            ? {
                items: {
                  data: [
                    { current_period_start: start, current_period_end: end },
                  ],
                },
              }
            : {}),
        },
      ),
      created,
    });

    it.each([true, false])(
      'ignores an older past_due snapshot after settlement (period supplied: %s)',
      async (withPeriod) => {
        const f = fixture();
        await processStripeEvent(f.tx, event('invoice.paid', invoice()));
        await processStripeEvent(f.tx, paid());
        await processStripeEvent(
          f.tx,
          snapshot('past_due', start + 60, withPeriod),
        );
        expect(f.state.membership.status).toBe('ACTIVE');
        await processStripeEvent(f.tx, snapshot('active', start + 180));
        await processStripeEvent(f.tx, paid());
        expect(f.state.membership.status).toBe('ACTIVE');
        expect(f.state.membership.currentPeriodEnd).toEqual(
          new Date(end * 1000),
        );
        expect(f.state.ledger).toHaveLength(3);
      },
    );
    it('settles correctly when the older past_due snapshot arrives before the payment', async () => {
      const f = fixture();
      await processStripeEvent(f.tx, event('invoice.paid', invoice()));
      await processStripeEvent(f.tx, snapshot('past_due', start + 60));
      expect(f.state.membership.status).toBe('PAST_DUE');
      await processStripeEvent(f.tx, snapshot('active', start + 180));
      expect(f.state.membership.status).toBe('PAST_DUE');
      await processStripeEvent(f.tx, paid());
      expect(f.state.membership.status).toBe('ACTIVE');
    });
    it.each([
      ['past_due', 'PAST_DUE'],
      ['paused', 'PAUSED'],
      ['canceled', 'CANCELLED'],
    ])(
      'preserves a genuinely newer %s after active snapshots and paid replay',
      async (status, expected) => {
        const f = fixture();
        await processStripeEvent(f.tx, event('invoice.paid', invoice()));
        await processStripeEvent(f.tx, paid());
        await processStripeEvent(f.tx, snapshot(status, start + 180));
        await processStripeEvent(f.tx, snapshot('active', start + 240));
        await processStripeEvent(f.tx, paid());
        expect(f.state.membership.status).toBe(expected);
      },
    );
    it.each([
      ['past_due', 'PAST_DUE'],
      ['paused', 'PAUSED'],
      ['canceled', 'CANCELLED'],
    ])(
      'does not undo a newer %s when an older paid invoice arrives late',
      async (status, expected) => {
        const f = fixture();
        await processStripeEvent(f.tx, event('invoice.paid', invoice()));
        await processStripeEvent(f.tx, snapshot(status, start + 180));
        await processStripeEvent(f.tx, paid());
        expect(f.state.membership.status).toBe(expected);
        expect(
          f.state.records.find((p: any) => p.stripeInvoiceId === 'in_october')
            .status,
        ).toBe('SUCCEEDED');
      },
    );
    it('does not regress a newer cancellation with an older same-period failure', async () => {
      const f = fixture();
      await processStripeEvent(f.tx, event('invoice.paid', invoice()));
      await processStripeEvent(f.tx, paid());
      await processStripeEvent(f.tx, snapshot('canceled', start + 300));
      await processStripeEvent(f.tx, snapshot('past_due', start + 240));
      expect(f.state.membership.status).toBe('CANCELLED');
    });
    it.each(['active', 'trialing'])(
      'does not grant unpaid recovery access from a %s snapshot',
      async (status) => {
        const f = fixture();
        await processStripeEvent(f.tx, snapshot(status, start + 60));
        expect(f.state.membership.purchaseId).toBeNull();
        expect(f.state.purchase.status).toBe('PENDING');
        expect(f.state.account).toBeNull();
        expect(f.state.records).toHaveLength(0);
      },
    );
  });
  it.each([
    [
      'charge.refunded',
      { payment_intent: 'pi_first', amount_refunded: 100, refunded: false },
      'PARTIALLY_REFUNDED',
      'PARTIALLY_REFUNDED',
    ],
    [
      'charge.refunded',
      { payment_intent: 'pi_first', amount_refunded: 9200, refunded: true },
      'REFUNDED',
      'REFUNDED',
    ],
    [
      'charge.dispute.created',
      { payment_intent: 'pi_first', amount: 9200 },
      'DISPUTED',
      'FAILED',
    ],
  ] as const)(
    'honors a fresh paid renewal after %s without erasing historical payment state',
    async (type, object, recordStatus, purchaseStatus) => {
      const f = fixture();
      await processStripeEvent(f.tx, event('invoice.paid', invoice()));
      await processStripeEvent(f.tx, event(type, object));
      expect(f.state.purchase.status).toBe(purchaseStatus);
      expect(f.state.records[0].status).toBe(recordStatus);
      const start = new Date('2026-10-03T16:00Z').getTime() / 1000;
      const end = new Date('2026-11-03T16:00Z').getTime() / 1000;
      const renewal = invoice({
        id: 'in_october',
        billing_reason: 'subscription_cycle',
        payments: {
          data: [
            {
              payment: { type: 'payment_intent', payment_intent: 'pi_october' },
            },
          ],
        },
        status_transitions: { paid_at: start },
        lines: {
          data: [
            {
              amount: 9200,
              parent: { type: 'subscription_item_details' },
              period: { start, end },
            },
          ],
        },
      });
      await processStripeEvent(f.tx, event('invoice.paid', renewal));
      expect(f.state.membership.currentPeriodEnd).toEqual(
        new Date('2026-11-03T16:00Z'),
      );
      expect(f.state.membership.status).toBe('ACTIVE');
      expect(f.state.account.validUntil).toEqual(new Date('2026-11-03T16:00Z'));
      expect(
        f.state.ledger.reduce((total: number, e: any) => total + e.quantity, 0),
      ).toBe(8);
      expect(f.state.purchase.status).toBe(purchaseStatus);
      expect(f.state.records[0].status).toBe(recordStatus);
      expect(f.state.records[1]).toMatchObject({
        stripeInvoiceId: 'in_october',
        status: 'SUCCEEDED',
        amountCents: 9200,
      });
      await processStripeEvent(f.tx, event('invoice.paid', renewal));
      expect(f.state.records).toHaveLength(2);
      expect(f.state.ledger).toHaveLength(3);
    },
  );
  it.each(['REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED'])(
    'preserves %s renewal state when an already settled invoice replays',
    async (status) => {
      const f = fixture();
      await processSombleRecoveryEvent(f.tx, event('invoice.paid', invoice()));
      const start = new Date('2026-10-03T16:00Z').getTime() / 1000;
      const end = new Date('2026-11-03T16:00Z').getTime() / 1000;
      const renewal = invoice({
        id: 'in_october',
        billing_reason: 'subscription_cycle',
        payments: {
          data: [
            {
              payment: { type: 'payment_intent', payment_intent: 'pi_october' },
            },
          ],
        },
        status_transitions: { paid_at: start },
        lines: {
          data: [
            {
              amount: 9200,
              parent: { type: 'subscription_item_details' },
              period: { start, end },
            },
          ],
        },
      });
      await processSombleRecoveryEvent(f.tx, event('invoice.paid', renewal));
      const record = f.state.records.find(
        (r: any) => r.stripeInvoiceId === 'in_october',
      );
      record.status = status;
      record.refundedAmountCents = 9200;
      await processSombleRecoveryEvent(f.tx, event('invoice.paid', renewal));
      expect(record.status).toBe(status);
      expect(record.refundedAmountCents).toBe(9200);
      expect(f.state.ledger).toHaveLength(3);
    },
  );
  it('keeps covered OG booking reservations linked to the native account so cancellation can restore the correct credit', async () => {
    const f = fixture();
    f.state.legacyEntries = [
      {
        id: 'reserve_og',
        creditAccountId: 'cmsoujv7l001dkz09yrcubhj5',
        bookingId: 'booking_og',
        type: 'RESERVE',
        quantity: -1,
      },
      {
        id: 'reserve_free',
        creditAccountId: 'cmu8knx1i0001jq09k1wqfy9x',
        bookingId: 'booking_free',
        type: 'RESERVE',
        quantity: -1,
      },
    ];
    f.state.bookings = [
      {
        id: 'booking_og',
        occurrence: { startAt: new Date('2026-09-25T15:00Z') },
      },
      {
        id: 'booking_free',
        occurrence: { startAt: new Date('2026-09-19T15:00Z') },
      },
    ];
    await processSombleRecoveryEvent(f.tx, event('invoice.paid', invoice()));
    expect(
      f.state.ledger.find((e: any) => e.id === 'reserve_og'),
    ).toMatchObject({
      creditAccountId: 'credit_native',
      bookingId: 'booking_og',
      type: 'RESERVE',
      quantity: -1,
    });
    expect(
      f.state.ledger.reduce((n: number, e: any) => n + e.quantity, 0),
    ).toBe(7);
    expect(
      f.state.legacyEntries.find((e: any) => e.id === 'reserve_free')
        .creditAccountId,
    ).toBe('cmu8knx1i0001jq09k1wqfy9x');
  });
  it('does not fulfill Checkout completion even when Stripe labels the trial no_payment_required', async () => {
    const f = fixture();
    expect(
      await processSombleRecoveryEvent(
        f.tx,
        event('checkout.session.completed', {
          metadata,
          payment_status: 'no_payment_required',
        }),
      ),
    ).toBe(true);
    expect(f.state.purchase.status).toBe('PENDING');
    expect(f.state.account).toBeNull();
  });
  it('links the original membership only on a valid paid invoice and preserves September access/activation', async () => {
    const f = fixture();
    await processSombleRecoveryEvent(f.tx, event('invoice.paid', invoice()));
    expect(f.state.membership.id).toBe(metadata.membershipId);
    expect(f.state.membership.purchaseId).toBe(pid);
    expect(f.state.membership.activatedAt).toEqual(
      new Date('2026-07-03T04:00Z'),
    );
    expect(f.state.membership.currentPeriodStart).toEqual(
      new Date('2026-09-03T04:00Z'),
    );
    expect(f.state.membership.currentPeriodEnd).toEqual(
      new Date('2026-10-03T16:00Z'),
    );
    expect(
      f.state.ledger.reduce((sum: number, e: any) => sum + e.quantity, 0),
    ).toBe(8);
    expect(f.state.records).toHaveLength(1);
    expect(f.state.records[0].amountCents).toBe(9200);
    await processSombleRecoveryEvent(f.tx, event('invoice.paid', invoice()));
    await processSombleRecoveryEvent(
      f.tx,
      event('checkout.session.completed', { metadata, payment_status: 'paid' }),
    );
    expect(f.state.ledger).toHaveLength(1);
    expect(f.state.records).toHaveLength(1);
  });
  it.each([
    { amount_paid: 0 },
    { currency: 'eur' },
    { customer: 'cus_other' },
    { status: 'open' },
    { amount_paid: 9609 },
  ])(
    'rejects an unverified first payment %j without access',
    async (override) => {
      const f = fixture();
      await expect(
        processSombleRecoveryEvent(
          f.tx,
          event('invoice.paid', invoice(override)),
        ),
      ).rejects.toThrow();
      expect(f.state.purchase.status).toBe('PENDING');
      expect(f.state.account).toBeNull();
    },
  );
  it('ignores stale trial period updates and uses actual paid renewal periods without rollover', async () => {
    const f = fixture();
    await processSombleRecoveryEvent(f.tx, event('invoice.paid', invoice()));
    await processSombleRecoveryEvent(
      f.tx,
      event('customer.subscription.updated', {
        id: 'sub_recovered',
        customer: 'cus_verified',
        metadata,
        status: 'trialing',
        items: {
          data: [
            {
              current_period_start: 1790013600,
              current_period_end: 1791043200,
            },
          ],
        },
      }),
    );
    expect(f.state.membership.currentPeriodStart).toEqual(
      new Date('2026-09-03T04:00Z'),
    );
    expect(f.state.membership.status).toBe('ACTIVE');
    const start = new Date('2026-10-03T16:00Z').getTime() / 1000;
    const end = new Date('2026-11-03T16:00Z').getTime() / 1000;
    await processSombleRecoveryEvent(
      f.tx,
      event(
        'invoice.paid',
        invoice({
          id: 'in_october',
          billing_reason: 'subscription_cycle',
          payments: {
            data: [
              {
                payment: {
                  type: 'payment_intent',
                  payment_intent: 'pi_october',
                },
              },
            ],
          },
          status_transitions: { paid_at: start + 10 },
          lines: {
            data: [
              {
                amount: 9200,
                parent: { type: 'subscription_item_details' },
                period: { start, end },
              },
            ],
          },
        }),
      ),
    );
    expect(f.state.membership.currentPeriodStart).toEqual(
      new Date('2026-10-03T16:00Z'),
    );
    expect(f.state.membership.currentPeriodEnd).toEqual(
      new Date('2026-11-03T16:00Z'),
    );
    expect(
      f.state.ledger.reduce((sum: number, e: any) => sum + e.quantity, 0),
    ).toBe(8);
    expect(f.state.records).toHaveLength(2);
  });
});
