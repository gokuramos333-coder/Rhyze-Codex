import { describe, expect, it } from 'vitest';
import { recordsInRange, summarizeFinancials } from '@/lib/admin/dashboard-analytics';
import { buildReconciledRevenueRecords } from '@/lib/admin/reconciled-financials';

describe('reconciled ADMIN revenue', () => {
  it('counts purchases, event orders, and standalone membership renewals exactly once', () => {
    const septemberStart = new Date('2026-09-01T04:00:00.000Z');
    const octoberStart = new Date('2026-10-01T04:00:00.000Z');
    const septemberCharge = new Date('2026-09-03T14:00:00.000Z');

    const records = buildReconciledRevenueRecords({
      sombleTransactions: [{
        amountCents: 3_000,
        transferredAt: new Date('2026-08-15T14:00:00.000Z'),
        paymentId: 'ch_somble',
        userId: 'somble-user',
        contentType: 'Event',
      }],
      purchases: [{
        id: 'purchase-1',
        amountCents: 43_300,
        paidAt: septemberCharge,
        createdAt: septemberCharge,
        userId: 'member-1',
        product: { name: 'Memberships and classes' },
      }],
      commerceOrders: [{
        id: 'order-1',
        amountCents: 54_000,
        paidAt: septemberCharge,
        createdAt: septemberCharge,
        userId: 'member-2',
        kind: 'EVENT',
      }],
      paymentRecords: [
        {
          id: 'payment-linked-purchase',
          amountCents: 43_300,
          occurredAt: septemberCharge,
          userId: 'member-1',
          purchaseId: 'purchase-1',
          commerceOrderId: null,
          stripeEventId: 'evt_purchase',
          stripePaymentIntentId: 'pi_purchase',
          kind: 'PRODUCT_PURCHASE',
        },
        {
          id: 'payment-linked-order',
          amountCents: 54_000,
          occurredAt: septemberCharge,
          userId: 'member-2',
          purchaseId: null,
          commerceOrderId: 'order-1',
          stripeEventId: 'evt_order',
          stripePaymentIntentId: 'pi_order',
          kind: 'EVENT',
        },
        {
          id: 'standalone-renewal',
          amountCents: 9_200,
          occurredAt: septemberCharge,
          userId: 'member-3',
          purchaseId: null,
          commerceOrderId: null,
          stripeEventId: 'evt_renewal',
          stripePaymentIntentId: 'pi_renewal',
          kind: 'MEMBERSHIP_RENEWAL',
        },
        {
          id: 'unlinked-guest',
          amountCents: 19_900,
          occurredAt: septemberCharge,
          userId: null,
          purchaseId: null,
          commerceOrderId: null,
          stripeEventId: 'evt_guest',
          stripePaymentIntentId: 'pi_guest',
          kind: 'PRODUCT_PURCHASE',
        },
        {
          id: 'somble-backed',
          amountCents: 3_000,
          occurredAt: septemberCharge,
          userId: 'somble-user',
          purchaseId: null,
          commerceOrderId: null,
          stripeEventId: 'stripe-sync-charge-ch_somble',
          stripePaymentIntentId: null,
          kind: 'EVENT',
        },
      ],
    });

    const september = recordsInRange(
      records,
      septemberStart,
      new Date(octoberStart.getTime() - 1),
    );

    expect(summarizeFinancials(september, [])).toEqual({
      grossCents: 106_500,
      refundCents: 0,
      netCents: 106_500,
    });
  });
});
