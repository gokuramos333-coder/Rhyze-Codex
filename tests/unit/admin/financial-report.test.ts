import { describe, expect, it } from 'vitest';
import {
  buildFinancialReport,
  financialReportCsvRows,
  formatReportMoney,
  type FinancialReportSources,
} from '@/lib/admin/financial-report';

const range = { range: 'custom', from: '2026-08-01', to: '2026-08-31' };
const at = new Date('2026-08-15T16:00:00Z');
function sources(): FinancialReportSources {
  return {
    purchases: [],
    commerceOrders: [],
    paymentRecords: [],
    sombleTransactions: [],
    purchaseRefunds: [],
    commerceRefunds: [],
    providerEvents: [],
  };
}
function payment(id: string, extra = {}) {
  return {
    id,
    amountCents: 3000,
    refundedAmountCents: 0,
    currency: 'usd',
    occurredAt: at,
    updatedAt: at,
    userId: 'member',
    purchaseId: null,
    membershipId: null,
    commerceOrderId: null,
    stripeEventId: `evt_${id}`,
    stripePaymentIntentId: `pi_${id}`,
    kind: 'EVENT',
    status: 'SUCCEEDED',
    productName: 'Seat Seduction w/ Vanessa',
    ...extra,
  };
}

describe('shared financial report', () => {
  it('totals and full CSV include more than 250 rows while the page is paginated', () => {
    const data = sources();
    data.paymentRecords = Array.from({ length: 301 }, (_, i) =>
      payment(String(i)),
    );
    const report = buildFinancialReport(data, { ...range, page: '2' });
    expect(report.totals[0].grossCents).toBe(903000);
    expect(report.rows).toHaveLength(301);
    expect(report.pageRows).toHaveLength(50);
    const csv = financialReportCsvRows(report);
    expect(csv).toHaveLength(302);
    const amountIndex = csv[0].indexOf('Amount minor units');
    expect(
      csv.slice(1).reduce((sum, row) => sum + Number(row[amountIndex]), 0),
    ).toBe(report.totals[0].grossCents);
  });
  it('deduplicates exact payment IDs but keeps separate same-customer charges and currencies', () => {
    const data = sources();
    data.purchases = [
      {
        id: 'p',
        amountCents: 3000,
        refundedAmountCents: 0,
        status: 'PAID',
        currency: 'usd',
        paidAt: at,
        createdAt: at,
        updatedAt: at,
        userId: 'member',
        stripePaymentIntentId: 'pi_purchase',
        product: { name: 'Class pack' },
      },
    ];
    data.paymentRecords = [
      payment('purchase', { purchaseId: 'p' }),
      payment('different'),
      payment('eur', { currency: 'eur' }),
    ];
    const report = buildFinancialReport(data, range);
    expect(report.rows).toHaveLength(3);
    expect(report.totals.find((t) => t.currency === 'USD')?.grossCents).toBe(
      6000,
    );
    expect(report.totals.find((t) => t.currency === 'EUR')?.grossCents).toBe(
      3000,
    );
  });
  it('counts an August charge and September refund in their separate periods', () => {
    const data = sources();
    data.commerceOrders = [
      {
        id: 'order',
        kind: 'EVENT',
        status: 'REFUNDED',
        amountCents: 3000,
        refundedAmountCents: 3000,
        currency: 'usd',
        paidAt: at,
        createdAt: at,
        updatedAt: new Date('2026-09-03T16:00:00Z'),
        userId: 'member',
        stripePaymentIntentId: 'pi_order',
        items: [{ name: 'Seat Seduction w/ Vanessa' }],
      },
    ];
    data.commerceRefunds = [
      {
        id: 'refund',
        commerceOrderId: 'order',
        amountCents: 3000,
        status: 'SUCCEEDED',
        createdAt: new Date('2026-09-03T16:00:00Z'),
      },
    ];
    expect(buildFinancialReport(data, range).totals[0]).toMatchObject({
      grossCents: 3000,
      refundCents: 0,
      netCents: 3000,
    });
    expect(
      buildFinancialReport(data, {
        range: 'custom',
        from: '2026-09-01',
        to: '2026-09-30',
      }).totals[0],
    ).toMatchObject({ grossCents: 0, refundCents: 3000, netCents: -3000 });
  });
  it('keeps imported Seat transfers alongside native Seat sales with provenance and unknown currency', () => {
    const data = sources();
    data.paymentRecords = [payment('seat')];
    data.sombleTransactions = [
      {
        id: 's',
        paymentId: 'legacy-seat',
        userId: 'member',
        amountCents: 3000,
        contentType: 'Seat Seduction w/ Vanessa',
        transferredAt: at,
      },
    ];
    const report = buildFinancialReport(data, range);
    expect(report.offerings).toHaveLength(1);
    expect(report.offerings[0].totals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: 'USD', grossCents: 3000 }),
        expect.objectContaining({ currency: 'UNKNOWN', importedCents: 3000 }),
      ]),
    );
    expect(report.rows.find((r) => r.source === 'SOMBLE')?.verification).toBe(
      'Imported / provider unverified',
    );
  });
  it('excludes unpaid/test charges and reports unmatched successful charges explicitly', () => {
    const data = sources();
    data.paymentRecords = [
      payment('failed', { status: 'FAILED' }),
      payment('test'),
      payment('review', { userId: null }),
    ];
    data.providerEvents = [
      {
        id: 'evt_test',
        type: 'payment_intent.succeeded',
        payload: {
          livemode: false,
          data: { object: { id: 'pi_test', livemode: false } },
        },
      },
    ];
    const report = buildFinancialReport(data, range);
    expect(report.rows).toHaveLength(1);
    expect(report.totals[0]).toMatchObject({
      grossCents: 0,
      unmatchedCents: 3000,
    });
    expect(report.feesCents).toBeNull();
    expect(report.profitCents).toBeNull();
  });
});

function receipt(id: string, extra: Record<string, unknown> = {}) {
  return {
    id: `rhyze-payment-reconciled-account-${id}`,
    type: 'rhyze.payment.reconciled',
    payload: {
      account: 'acct_live',
      livemode: true,
      reconciledAt: '2026-09-28T12:00:00Z',
      data: {
        object: {
          id: `ch_${id}`,
          payment_intent: `pi_${id}`,
          paid: true,
          captured: true,
          status: 'succeeded',
          amount: 3000,
          amount_captured: 3000,
          currency: 'usd',
          created: Math.floor(at.getTime() / 1000),
          capturedAt: Math.floor(at.getTime() / 1000),
          amount_refunded: 0,
          refunds: { data: [] },
          balance_transaction: {
            id: `txn_${id}`,
            fee: 117,
            currency: 'usd',
            created: Math.floor(at.getTime() / 1000),
          },
          ...extra,
        },
      },
    },
  };
}
describe('provider verified financial tier', () => {
  it.each([null, 'payer-email-member'])('allocates a connected charge by exact Somble transfer while preserving unrelated same-amount imports (native user=%s)', (nativeUser) => {
    const data = sources();
    data.sombleTransactions = [
      { id: 'linked-transfer', paymentId: 'pi_platform', transferId: 'tr_exact', userId: 'member', user: { name: 'Ticket Member' }, amountCents: 2800, contentType: 'Seat Seduction w/ Vanessa', transferredAt: at },
      { id: 'unrelated-transfer', paymentId: 'pi_other_platform', transferId: 'tr_unrelated', userId: 'other-member', amountCents: 2800, contentType: 'Other class', transferredAt: at },
    ];
    data.paymentRecords = [payment('connected', { userId: nativeUser, productName: null })];
    data.providerEvents = [receipt('connected', { source_transfer: 'tr_exact' })];
    const report = buildFinancialReport(data, range);
    const collected = report.rows.filter(row => row.providerVerified && row.entryType === 'COLLECTION');
    expect(collected).toHaveLength(1);
    expect(collected[0]).toMatchObject({ amountCents: 3000, userId: 'member', customer: 'Ticket Member', offering: 'Seat Seduction w/ Vanessa', allocationRequired: false });
    expect(report.rows.filter(row => row.source === 'SOMBLE')).toMatchObject([{ reference: 'pi_other_platform', amountCents: 2800 }]);
    expect(report.rows.filter(row => row.entryType === 'UNMATCHED')).toHaveLength(0);
    expect(report.totals.find(total => total.currency === 'USD')).toMatchObject({ verifiedGrossCents: 3000, unallocatedVerifiedCents: 0 });
  });
  it('uses exact provider amounts, includes unallocated paid charges, and separates unverified database money', () => {
    const data = sources();
    data.paymentRecords = [
      payment('paid', { amountCents: 3500 }),
      payment('app-only', { amountCents: 1000 }),
    ];
    data.providerEvents = [
      receipt('paid'),
      receipt('unallocated', {
        amount: 2000,
        amount_captured: 2000,
        balance_transaction: {
          id: 'txn_unallocated',
          fee: 88,
          currency: 'usd',
          created: Math.floor(at.getTime() / 1000),
        },
      }),
    ];
    const report = buildFinancialReport(data, range);
    expect(report.totals[0]).toMatchObject({
      verifiedGrossCents: 5000,
      verifiedRefundCents: 0,
      verifiedFeeCents: 205,
      verifiedNetCents: 5000,
      unverifiedGrossCents: 1000,
      unallocatedVerifiedCents: 2000,
    });
    expect(
      report.rows.filter((r) => r.entryType === 'COLLECTION'),
    ).toHaveLength(3);
    expect(
      report.rows.find(
        (r) => r.id.includes('unallocated') && r.entryType === 'COLLECTION',
      ),
    ).toMatchObject({ providerVerified: true, allocationRequired: true });
    expect(report.profitCents).toBeNull();
  });
  it('replaces matching imported charge IDs with provider evidence and dates refunds separately without duplication', () => {
    const data = sources();
    data.sombleTransactions = [
      {
        id: 's',
        paymentId: 'ch_seat',
        userId: 'member',
        amountCents: 3000,
        contentType: 'Seat Seduction w/ Vanessa',
        transferredAt: at,
      },
    ];
    data.providerEvents = [
      receipt('seat', {
        amount_refunded: 3000,
        refunds: {
          data: [
            {
              id: 're_seat',
              amount: 3000,
              currency: 'usd',
              status: 'succeeded',
              created: Math.floor(
                new Date('2026-09-02T16:00:00Z').getTime() / 1000,
              ),
            },
          ],
        },
      }),
    ];
    const august = buildFinancialReport(data, range);
    expect(august.totals).toHaveLength(1);
    expect(august.totals[0]).toMatchObject({
      currency: 'USD',
      verifiedGrossCents: 3000,
      importedCents: 0,
      verifiedRefundCents: 0,
    });
    const september = buildFinancialReport(data, {
      range: 'custom',
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(september.totals[0]).toMatchObject({
      verifiedGrossCents: 0,
      verifiedRefundCents: 3000,
      verifiedNetCents: -3000,
    });
    expect(september.rows[0].offering).toBe('Seat Seduction w/ Vanessa');
  });
  it('never treats absent fee data as zero or test receipts as live money', () => {
    const data = sources();
    const test = receipt('test');
    test.payload.livemode = false;
    data.providerEvents = [
      receipt('missingfee', { balance_transaction: null }),
      test,
    ];
    const report = buildFinancialReport(data, range);
    expect(report.totals[0]).toMatchObject({
      verifiedGrossCents: 3000,
      feeCoverageComplete: false,
    });
    expect(report.rows).toHaveLength(1);
    expect(report.feesCents).toBeNull();
  });
});

it('reconciles a legacy synced charge by exact charge ID when provider has no payment intent', () => {
  const data = sources();
  data.paymentRecords = [
    payment('legacy', {
      userId: null,
      stripeEventId: 'stripe-sync-charge-ch_legacy',
      stripePaymentIntentId: 'pi_old_link',
    }),
  ];
  data.providerEvents = [receipt('legacy', { payment_intent: null })];
  const report = buildFinancialReport(data, range);
  expect(report.totals[0]).toMatchObject({
    verifiedGrossCents: 3000,
    unmatchedCents: 0,
    unallocatedVerifiedCents: 3000,
  });
  expect(report.rows.filter((r) => r.entryType === 'COLLECTION')).toHaveLength(
    1,
  );
});

it('formats each currency using its provider minor-unit scale', () => {
  expect(formatReportMoney(3000, 'JPY')).toBe('¥3,000');
  expect(formatReportMoney(1000, 'BHD')).toContain('1.000');
});

it('exports signed provider movements that sum to the displayed net after refunds and fees', () => {
  const data = sources();
  data.providerEvents = [
    receipt('signed', {
      amount_refunded: 1000,
      refunds: {
        data: [
          {
            id: 're_signed',
            amount: 1000,
            currency: 'usd',
            status: 'succeeded',
            created: Math.floor(at.getTime() / 1000),
          },
        ],
      },
    }),
  ];
  const report = buildFinancialReport(data, range),
    csv = financialReportCsvRows(report);
  const verified = csv[0].indexOf('Provider verified'),
    movement = csv[0].indexOf('Net movement minor units');
  const exportedNet = csv
    .slice(1)
    .filter((row) => row[verified] === 'true')
    .reduce((sum, row) => sum + Number(row[movement]), 0);
  expect(exportedNet).toBe(1883);
  expect(exportedNet).toBe(
    report.totals[0].verifiedNetCents - report.totals[0].verifiedFeeCents,
  );
  expect(csv[1][csv[0].indexOf('Range from UTC inclusive')]).toBe(
    '2026-08-01T04:00:00.000Z',
  );
});
it('does not subtract settlement-currency fees from a different charge currency', () => {
  const data = sources();
  data.providerEvents = [
    receipt('fx', {
      currency: 'eur',
      balance_transaction: {
        id: 'txn_fx',
        fee: 100,
        currency: 'usd',
        created: Math.floor(at.getTime() / 1000),
      },
    }),
  ];
  const report = buildFinancialReport(data, range);
  expect(report.totals.find((row) => row.currency === 'EUR')).toMatchObject({
    verifiedGrossCents: 3000,
    verifiedFeeCents: 0,
    feeCoverageComplete: false,
  });
  expect(report.totals.find((row) => row.currency === 'USD')).toMatchObject({
    verifiedGrossCents: 0,
    verifiedFeeCents: 100,
  });
});

it('attributes a class ticket to its dated class and preserves paid booking-review visibility', () => {
  const data = sources();
  data.purchases = [
    {
      id: 'ticket',
      amountCents: 1500,
      paidAt: at,
      createdAt: at,
      userId: 'member',
      status: 'PAID',
      currency: 'usd',
      product: { name: 'Single Class' },
      policyAcceptance: {
        classTicket: {
          occurrenceId: 'rachel-oct16',
          name: 'Soul Line Dancing',
          startAt: '2026-10-16T23:30:00.000Z',
          endAt: '2026-10-17T00:20:00.000Z',
          amountCents: 1500,
        },
        classTicketFulfillment: { status: 'REVIEW', reason: 'Class full' },
      },
    },
  ];
  const report = buildFinancialReport(data, range);
  expect(report.rows[0]).toMatchObject({
    offering: 'Soul Line Dancing',
    occurrenceId: 'rachel-oct16',
    isEvent: false,
    amountCents: 1500,
    reviewNote: 'Paid class ticket needs booking review',
  });
});

it('withholds stale provider verification when a newer live refund event exists', () => {
  const data = sources();
  data.paymentRecords = [payment('stale')];
  data.providerEvents = [
    receipt('stale'),
    {
      id: 'evt_newrefund',
      type: 'charge.refunded',
      payload: {
        livemode: true,
        created: Math.floor(new Date('2026-09-29T12:00:00Z').getTime() / 1000),
        data: {
          object: {
            id: 'ch_stale',
            payment_intent: 'pi_stale',
            amount_refunded: 1000,
          },
        },
      },
    },
  ];
  const report = buildFinancialReport(data, range);
  expect(report.staleProviderReceipts).toHaveLength(1);
  expect(report.totals[0]).toMatchObject({
    verifiedGrossCents: 0,
    unverifiedGrossCents: 3000,
  });
  expect(report.providerReceiptCount).toBe(0);
});

it('treats same-second live adjustment evidence conservatively but ignores unrelated and test events', () => {
  const data = sources();
  data.paymentRecords = [payment('freshness')];
  const event = {
    id: 'evt_refund_update',
    type: 'refund.updated',
    payload: {
      livemode: true,
      created: Math.floor(Date.parse('2026-09-28T12:00:00Z') / 1000),
      data: { object: { id: 're_update', charge: { id: 'ch_freshness' } } },
    },
  };
  data.providerEvents = [receipt('freshness'), event];
  expect(buildFinancialReport(data, range).staleProviderReceipts).toHaveLength(
    1,
  );
  event.payload.livemode = false;
  expect(buildFinancialReport(data, range).providerReceiptCount).toBe(1);
  event.payload.livemode = true;
  event.payload.data.object.charge.id = 'ch_other';
  expect(buildFinancialReport(data, range).providerReceiptCount).toBe(1);
});

it('retains a visible stale warning when a receipt refresh failed even if the triggering event is older', () => {
  const data = sources(); data.paymentRecords = [payment('pending')];
  data.providerEvents = [{ ...receipt('pending'), type: 'rhyze.payment.reconciliation-pending' }];
  const report = buildFinancialReport(data, range);
  expect(report.staleProviderReceipts).toHaveLength(1);
  expect(report.totals[0]).toMatchObject({ verifiedGrossCents: 0, unverifiedGrossCents: 3000 });
});
it('accepts a fresh receipt acknowledging its same-second signed event', () => {
  const data = sources(); const fresh = receipt('ack');
  data.providerEvents = [{ ...fresh, payload: { ...fresh.payload, acknowledgedEventIds: ['evt_ack'] } }, { id: 'evt_ack', type: 'charge.succeeded', payload: { livemode: true, created: Math.floor(Date.parse(fresh.payload.reconciledAt) / 1000), data: { object: { id: 'ch_ack' } } } }];
  expect(buildFinancialReport(data, range).providerReceiptCount).toBe(1);
});

it('warns when the first provider receipt is pending and its amount and charge date are unknown', () => {
  const data = sources();
  data.providerEvents = [{ id: 'pending_new', type: 'rhyze.payment.reconciliation-pending', payload: { account: 'acct_live', livemode: true, data: { object: { id: 'ch_new', payment_intent: 'pi_new' } } } }];
  const report = buildFinancialReport(data, range);
  expect(report.staleProviderReceipts).toEqual([expect.objectContaining({ chargeId: 'ch_new', chargeCreatedAt: null })]);
  expect(report.providerReceiptCount).toBe(0);
});
