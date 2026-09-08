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
      }, {
        id: 'original-membership-purchase',
        amountCents: 9_200,
        paidAt: new Date('2026-08-03T14:00:00.000Z'),
        createdAt: new Date('2026-08-03T14:00:00.000Z'),
        userId: 'member-3',
        product: { name: 'OG Rhyze Tribe' },
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
          membershipId: null,
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
          membershipId: null,
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
          userId: null,
          membershipId: 'membership-3',
          purchaseId: 'original-membership-purchase',
          commerceOrderId: null,
          stripeEventId: 'evt_renewal',
          stripePaymentIntentId: 'pi_renewal',
          kind: 'MEMBERSHIP_RENEWAL',
          membership: { activatedAt: new Date('2026-08-03T14:00:00.000Z') },
        },
        {
          id: 'unlinked-guest',
          amountCents: 19_900,
          occurredAt: septemberCharge,
          userId: null,
          membershipId: null,
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
          membershipId: null,
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

  it('does not count the initial membership invoice twice', () => {
    const paidAt = new Date('2026-09-03T14:00:00.000Z');
    const records = buildReconciledRevenueRecords({
      sombleTransactions: [],
      purchases: [{
        id: 'initial-membership-purchase',
        amountCents: 9_200,
        paidAt,
        createdAt: paidAt,
        userId: 'member-1',
        product: { name: 'OG Rhyze Tribe' },
      }],
      commerceOrders: [],
      paymentRecords: [{
        id: 'initial-membership-invoice',
        amountCents: 9_200,
        occurredAt: new Date(paidAt.getTime() + 60_000),
        userId: 'member-1',
        membershipId: 'membership-1',
        purchaseId: 'initial-membership-purchase',
        commerceOrderId: null,
        stripeEventId: 'evt_initial_membership',
        stripePaymentIntentId: 'pi_initial_membership',
        kind: 'MEMBERSHIP_RENEWAL',
        membership: { activatedAt: paidAt },
      }],
    });

    expect(summarizeFinancials(records, [])).toEqual({
      grossCents: 9_200,
      refundCents: 0,
      netCents: 9_200,
    });
  });
});
