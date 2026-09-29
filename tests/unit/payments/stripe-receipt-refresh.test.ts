import Stripe from 'stripe';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  invalidateKnownStripeEventReceipts,
  refreshStripeEventReceipt,
} from '@/lib/payments/stripe-receipt-refresh';

const charge = (extra = {}) => ({
  id: 'ch_sale',
  object: 'charge',
  livemode: true,
  paid: true,
  captured: true,
  status: 'succeeded',
  amount: 3000,
  amount_captured: 3000,
  currency: 'usd',
  amount_refunded: 0,
  refunded: false,
  disputed: false,
  created: 1785000000,
  payment_intent: 'pi_sale',
  balance_transaction: {
    id: 'txn_sale',
    fee: 117,
    net: 2883,
    amount: 3000,
    currency: 'usd',
    created: 1785000000,
  },
  ...extra,
});
const event = (type = 'charge.succeeded', object: any = charge(), extra = {}) =>
  ({
    id: 'evt_sale',
    type,
    livemode: true,
    created: 1785000000,
    data: { object },
    ...extra,
  }) as Stripe.Event;
function fixtures() {
  const rows = new Map<string, any>();
  const db = {
    stripeEvent: {
      findUnique: vi.fn(async ({ where }: any) => rows.get(where.id) || null),
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const row = rows.has(where.id)
          ? { ...rows.get(where.id), ...update }
          : create;
        rows.set(where.id, row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const matches = (row: any, filter: any): boolean =>
          Object.entries(filter).every(([key, value]: any) => {
            if (key === 'AND')
              return value.every((item: any) => matches(row, item));
            if (key === 'payload')
              return (
                value.path.reduce(
                  (part: any, key: string) => part?.[key],
                  row.payload,
                ) === value.equals
              );
            return typeof value === 'object' && value.in
              ? value.in.includes(row[key])
              : row[key] === value;
          });
        let count = 0;
        for (const [id, row] of rows)
          if (matches(row, where)) {
            rows.set(id, { ...row, ...data });
            count++;
          }
        return { count };
      }),
    },
  };
  const stripe = {
    invoices: { retrieve: vi.fn() },
    invoicePayments: { list: vi.fn() },
    accounts: { retrieve: vi.fn(async () => ({ id: 'acct_site' })) },
    charges: { retrieve: vi.fn(async () => charge()) },
    paymentIntents: {
      retrieve: vi.fn(async () => ({
        id: 'pi_sale',
        livemode: true,
        latest_charge: 'ch_sale',
      })),
    },
    refunds: { list: vi.fn(async () => ({ data: [], has_more: false })) },
    disputes: { list: vi.fn(async () => ({ data: [], has_more: false })) },
  };
  const refresh = (e = event()) =>
    refreshStripeEventReceipt(db as any, stripe as any, e, 'acct_site');
  return { db, stripe, rows, refresh };
}
beforeEach(() => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_test');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.rhyzefitness.com');
});
afterEach(() => vi.unstubAllEnvs());
describe('receipt-only refresh from signed events', () => {
  it('retrieves the exact new sale and writes provider collection and fees without payment or entitlement methods', async () => {
    const f = fixtures();
    await f.refresh();
    expect(f.stripe.charges.retrieve).toHaveBeenCalledWith('ch_sale', {
      expand: ['balance_transaction'],
    });
    expect(
      f.rows.get('rhyze-payment-reconciled-acct_site-ch_sale'),
    ).toMatchObject({
      type: 'rhyze.payment.reconciled',
      payload: {
        account: 'acct_site',
        acknowledgedEventIds: ['evt_sale'],
        data: {
          object: { amount_captured: 3000, balance_transaction: { fee: 117 } },
        },
      },
    });
  });
  it('refreshes later succeeded refunds and preserves unknown fee instead of inventing zero', async () => {
    const f = fixtures();
    await f.refresh();
    f.stripe.charges.retrieve.mockResolvedValue(
      charge({ amount_refunded: 1000, balance_transaction: null }) as any,
    );
    f.stripe.refunds.list.mockResolvedValue({
      data: [
        {
          id: 're_sale',
          charge: 'ch_sale',
          payment_intent: 'pi_sale',
          livemode: true,
          status: 'succeeded',
          amount: 1000,
          currency: 'usd',
          created: 1785100000,
        },
      ],
      has_more: false,
    } as any);
    await f.refresh(
      event(
        'refund.updated',
        {
          id: 're_sale',
          charge: 'ch_sale',
          payment_intent: 'pi_sale',
          livemode: true,
        },
        { id: 'evt_refund' },
      ),
    );
    expect(
      f.rows.get('rhyze-payment-reconciled-acct_site-ch_sale').payload.data
        .object,
    ).toMatchObject({
      amount_refunded: 1000,
      balance_transaction: null,
      refunds: { data: [{ amount: 1000 }] },
    });
  });
  it('leaves the last receipt pending after provider failure and recovers on duplicate refresh', async () => {
    const f = fixtures();
    await f.refresh();
    f.stripe.charges.retrieve.mockRejectedValueOnce(new Error('unavailable'));
    await expect(f.refresh(event('charge.refunded'))).rejects.toThrow(
      'unavailable',
    );
    expect(f.rows.get('rhyze-payment-reconciled-acct_site-ch_sale').type).toBe(
      'rhyze.payment.reconciliation-pending',
    );
    await f.refresh();
    expect(f.rows.get('rhyze-payment-reconciled-acct_site-ch_sale').type).toBe(
      'rhyze.payment.reconciled',
    );
  });
  it.each([
    event('payment_intent.succeeded', { id: 'pi_sale', livemode: true }),
    event('checkout.session.completed', {
      id: 'cs_sale',
      payment_intent: 'pi_sale',
      livemode: true,
      payment_status: 'paid',
    }),
    event('invoice.paid', {
      id: 'in_sale',
      livemode: true,
      payments: {
        data: [
          { payment: { type: 'payment_intent', payment_intent: 'pi_sale' } },
        ],
        has_more: false,
      },
    }),
  ])('resolves the exact intent for $type', async (e) => {
    const f = fixtures();
    await f.refresh(e);
    expect(f.stripe.paymentIntents.retrieve).toHaveBeenCalledWith('pi_sale');
    expect(f.rows.get('rhyze-payment-reconciled-acct_site-ch_sale').type).toBe(
      'rhyze.payment.reconciled',
    );
  });
  it.each([
    event('charge.succeeded', charge(), { account: 'acct_other' }),
    event('charge.succeeded', charge({ livemode: false })),
    event('charge.succeeded', charge(), { livemode: false }),
  ])('fails closed on account or mode disagreement', async (e) => {
    const f = fixtures();
    await expect(f.refresh(e)).rejects.toThrow();
    expect(f.rows.size).toBe(0);
  });
  it('rejects a retrieved charge belonging to another intent', async () => {
    const f = fixtures();
    f.stripe.charges.retrieve.mockResolvedValue(
      charge({ payment_intent: 'pi_other' }),
    );
    await expect(
      f.refresh(
        event('payment_intent.succeeded', { id: 'pi_sale', livemode: true }),
      ),
    ).rejects.toThrow();
    expect(
      [...f.rows.values()].every(
        (row) => row.type !== 'rhyze.payment.reconciled',
      ),
    ).toBe(true);
  });
});

it('invalidates an existing receipt before intent lookup failure without touching another account', async () => {
  const f = fixtures();
  await f.refresh();
  const otherId = 'rhyze-payment-reconciled-acct_other-ch_other';
  f.rows.set(otherId, {
    ...f.rows.values().next().value,
    id: otherId,
    payload: {
      account: 'acct_other',
      data: { object: { payment_intent: 'pi_sale' } },
    },
  });
  f.stripe.paymentIntents.retrieve.mockRejectedValueOnce(
    new Error('lookup failed'),
  );
  await expect(
    f.refresh(
      event('payment_intent.succeeded', { id: 'pi_sale', livemode: true }),
    ),
  ).rejects.toThrow('lookup failed');
  expect(f.rows.get('rhyze-payment-reconciled-acct_site-ch_sale').type).toBe(
    'rhyze.payment.reconciliation-pending',
  );
  expect(f.rows.get(otherId).type).toBe('rhyze.payment.reconciled');
});
it('cannot overwrite a later refund receipt when concurrent provider reads finish out of order', async () => {
  const f = fixtures();
  let complete!: (charge: any) => void;
  f.stripe.charges.retrieve.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const oldRead = f.refresh();
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
  f.stripe.charges.retrieve.mockResolvedValue(
    charge({ amount_refunded: 3000 }),
  );
  f.stripe.refunds.list.mockResolvedValue({
    data: [
      {
        id: 're_full',
        charge: 'ch_sale',
        amount: 3000,
        currency: 'usd',
        status: 'succeeded',
        created: 1785000001,
      },
    ],
    has_more: false,
  } as any);
  await f.refresh(event('charge.refunded', charge(), { id: 'evt_refund' }));
  complete(charge());
  await expect(oldRead).rejects.toThrow('superseded');
  expect(
    f.rows.get('rhyze-payment-reconciled-acct_site-ch_sale').payload.data.object
      .amount_refunded,
  ).toBe(3000);
});
it('follows all invoice payment pages and supports a legacy direct charge', async () => {
  const f = fixtures();
  f.stripe.invoicePayments.list
    .mockResolvedValueOnce({
      data: [
        {
          id: 'ip_first',
          invoice: 'in_sale',
          livemode: true,
          payment: { type: 'payment_intent', payment_intent: 'pi_sale' },
        },
      ],
      has_more: true,
    })
    .mockResolvedValueOnce({
      data: [
        {
          id: 'ip_last',
          invoice: 'in_sale',
          livemode: true,
          payment: { type: 'charge', charge: 'ch_legacy' },
        },
      ],
      has_more: false,
    });
  f.stripe.charges.retrieve.mockImplementation(async (id?: any) =>
    charge({ id, payment_intent: id === 'ch_legacy' ? null : 'pi_sale' }),
  );
  await f.refresh(
    event('invoice.paid', {
      id: 'in_sale',
      livemode: true,
      payments: { data: [], has_more: true },
    }),
  );
  expect(f.stripe.invoicePayments.list).toHaveBeenLastCalledWith({
    invoice: 'in_sale',
    limit: 100,
    starting_after: 'ip_first',
  });
  expect(
    [...f.rows.values()].filter(
      (row) => row.type === 'rhyze.payment.reconciled',
    ),
  ).toHaveLength(2);
});
it('resolves a subscription checkout through its exact invoice', async () => {
  const f = fixtures();
  f.stripe.invoices.retrieve.mockResolvedValue({
    id: 'in_sale',
    livemode: true,
    payments: {
      data: [
        { payment: { type: 'payment_intent', payment_intent: 'pi_sale' } },
      ],
      has_more: false,
    },
  });
  await f.refresh(
    event('checkout.session.completed', {
      id: 'cs_sale',
      livemode: true,
      invoice: 'in_sale',
    }),
  );
  expect(f.stripe.invoices.retrieve).toHaveBeenCalledWith('in_sale', {
    expand: ['payments.data.payment'],
  });
  expect(f.rows.get('rhyze-payment-reconciled-acct_site-ch_sale').type).toBe(
    'rhyze.payment.reconciled',
  );
});

it('resolves charge.refund.updated through the refund charge reference', async () => {
  const f = fixtures();
  await f.refresh(
    event('charge.refund.updated', {
      id: 're_sale',
      object: 'refund',
      charge: 'ch_sale',
      payment_intent: 'pi_sale',
    }),
  );
  expect(f.stripe.charges.retrieve).toHaveBeenCalledWith('ch_sale', {
    expand: ['balance_transaction'],
  });
});

it('invalidates known signed adjustments even when account lookup failed and the event timestamp is older', async () => {
  const f = fixtures();
  await f.refresh();
  await invalidateKnownStripeEventReceipts(
    f.db as any,
    event(
      'charge.refunded',
      { id: 'ch_sale', object: 'charge', livemode: true },
      { created: 1 },
    ),
  );
  expect(f.rows.get('rhyze-payment-reconciled-acct_site-ch_sale').type).toBe(
    'rhyze.payment.reconciliation-pending',
  );
});

it.each(['tr_somble', { id: 'tr_somble' }])('retains the exact source transfer as provider evidence (%j)', async source_transfer => {
  const f = fixtures(); f.stripe.charges.retrieve.mockResolvedValue(charge({ source_transfer }));
  await f.refresh();
  expect(f.rows.get('rhyze-payment-reconciled-acct_site-ch_sale').payload.data.object.source_transfer).toBe('tr_somble');
});
