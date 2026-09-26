import { describe, expect, it } from 'vitest';
import { recordsInRange, summarizeFinancials } from '@/lib/admin/dashboard-analytics';
import {
  buildReconciledRefundRecords,
  buildReconciledRevenueRecords,
} from '@/lib/admin/reconciled-financials';

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
        stripePaymentIntentId: 'pi_purchase_row',
        product: { name: 'Memberships and classes' },
      }, {
        id: 'original-membership-purchase',
        amountCents: 9_200,
        paidAt: new Date('2026-08-03T14:00:00.000Z'),
        createdAt: new Date('2026-08-03T14:00:00.000Z'),
        userId: 'member-3',
        stripePaymentIntentId: 'pi_original_membership',
        product: { name: 'OG Rhyze Tribe' },
      }],
      commerceOrders: [{
        id: 'order-1',
        amountCents: 54_000,
        paidAt: septemberCharge,
        createdAt: septemberCharge,
        userId: 'member-2',
        kind: 'EVENT',
        stripePaymentIntentId: 'pi_order',
      }],
      paymentRecords: [
        {
          id: 'payment-linked-purchase',
          amountCents: 43_300,
          occurredAt: septemberCharge,
          userId: 'member-1',
          membershipId: 'membership-1',
          purchaseId: null,
          commerceOrderId: null,
          stripeEventId: 'evt_purchase',
          stripePaymentIntentId: 'pi_purchase',
          kind: 'MEMBERSHIP_RENEWAL',
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
        stripePaymentIntentId: 'pi_initial_membership',
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
      }],
    });

    expect(summarizeFinancials(records, [])).toEqual({
      grossCents: 9_200,
      refundCents: 0,
      netCents: 9_200,
    });
  });

  it('counts Stripe-recorded refunds without duplicating explicit refund rows', () => {
    const refundAt = new Date('2026-09-12T15:00:00.000Z');
    const refunds = buildReconciledRefundRecords({
      purchases: [{
        id: 'purchase-1',
        amountCents: 9_200,
        paidAt: new Date('2026-09-01T14:00:00.000Z'),
        createdAt: new Date('2026-09-01T14:00:00.000Z'),
        userId: 'member-1',
        product: { name: 'Elevate' },
      }],
      commerceOrders: [{
        id: 'order-1',
        amountCents: 3_000,
        paidAt: new Date('2026-09-02T14:00:00.000Z'),
        createdAt: new Date('2026-09-02T14:00:00.000Z'),
        userId: 'member-2',
        kind: 'EVENT',
      }],
      purchaseRefunds: [{
        id: 'refund-1',
        purchaseId: 'purchase-1',
        amountCents: 9_200,
        createdAt: refundAt,
      }],
      commerceRefunds: [],
      paymentRecords: [{
        id: 'payment-purchase',
        amountCents: 9_200,
        refundedAmountCents: 9_200,
        occurredAt: new Date('2026-09-01T14:00:00.000Z'),
        updatedAt: refundAt,
        userId: 'member-1',
        membershipId: 'membership-1',
        purchaseId: 'purchase-1',
        commerceOrderId: null,
        stripeEventId: 'event-1',
        stripePaymentIntentId: 'pi-1',
        kind: 'MEMBERSHIP_RENEWAL',
      }, {
        id: 'payment-order',
        amountCents: 3_000,
        refundedAmountCents: 3_000,
        occurredAt: new Date('2026-09-02T14:00:00.000Z'),
        updatedAt: refundAt,
        userId: 'member-2',
        membershipId: null,
        purchaseId: null,
        commerceOrderId: 'order-1',
        stripeEventId: 'event-2',
        stripePaymentIntentId: 'pi-2',
        kind: 'EVENT',
      }],
    });

    expect(refunds.map((item) => [item.id, item.amountCents])).toEqual([
      ['purchase-refund-refund-1', 9_200],
      ['payment-refund-payment-order', 3_000],
    ]);
    expect(refunds.reduce((total, item) => total + item.amountCents, 0)).toBe(12_200);
  });

  it('excludes pending commerce refund attempts from financial refund totals', () => {
    const refundAt = new Date('2026-09-12T15:00:00.000Z');
    const refunds = buildReconciledRefundRecords({
      purchases: [],
      commerceOrders: [{
        id: 'order-pending-refund',
        amountCents: 3_000,
        paidAt: new Date('2026-09-02T14:00:00.000Z'),
        createdAt: new Date('2026-09-02T14:00:00.000Z'),
        userId: 'member-2',
        kind: 'EVENT',
      }],
      purchaseRefunds: [],
      commerceRefunds: [{
        id: 'pending-row',
        commerceOrderId: 'order-pending-refund',
        amountCents: 3_000,
        createdAt: refundAt,
        status: 'PENDING',
      }],
      paymentRecords: [],
    });

    expect(refunds).toEqual([]);
  });

  it('keeps separate refunded subscription renewals as separate money movements', () => {
    const refunds = buildReconciledRefundRecords({
      purchases: [{
        id: 'subscription-purchase',
        amountCents: 9_200,
        paidAt: new Date('2026-08-01T14:00:00.000Z'),
        createdAt: new Date('2026-08-01T14:00:00.000Z'),
        userId: 'member-1',
        product: { name: 'Elevate' },
      }],
      commerceOrders: [],
      purchaseRefunds: [],
      commerceRefunds: [],
      paymentRecords: [
        {
          id: 'renewal-august', amountCents: 9_200, refundedAmountCents: 9_200,
          occurredAt: new Date('2026-08-01T14:00:00.000Z'), updatedAt: new Date('2026-08-03T14:00:00.000Z'),
          userId: 'member-1', membershipId: 'membership-1', purchaseId: 'subscription-purchase', commerceOrderId: null,
          stripeEventId: 'event-august', stripePaymentIntentId: 'pi-august', kind: 'MEMBERSHIP_RENEWAL',
        },
        {
          id: 'renewal-september', amountCents: 9_200, refundedAmountCents: 9_200,
          occurredAt: new Date('2026-09-01T14:00:00.000Z'), updatedAt: new Date('2026-09-03T14:00:00.000Z'),
          userId: 'member-1', membershipId: 'membership-1', purchaseId: 'subscription-purchase', commerceOrderId: null,
          stripeEventId: 'event-september', stripePaymentIntentId: 'pi-september', kind: 'MEMBERSHIP_RENEWAL',
        },
      ],
    });

    expect(refunds.map((item) => item.amountCents)).toEqual([9_200, 9_200]);
  });

  it('falls back to a refunded order balance when an older row has no refund transaction or payment record', () => {
    const refundedAt = new Date('2026-07-27T01:09:40.000Z');
    const refunds = buildReconciledRefundRecords({
      purchases: [],
      commerceOrders: [{
        id: 'legacy-order',
        amountCents: 3_000,
        refundedAmountCents: 3_000,
        paidAt: new Date('2026-07-27T01:07:11.000Z'),
        createdAt: new Date('2026-07-27T01:07:11.000Z'),
        updatedAt: refundedAt,
        userId: 'member-1',
        kind: 'EVENT',
      }],
      purchaseRefunds: [],
      commerceRefunds: [],
      paymentRecords: [],
    });

    expect(refunds.map((item) => [item.id, item.amountCents, item.occurredAt])).toEqual([
      ['commerce-balance-refund-legacy-order', 3_000, refundedAt],
    ]);
  });

  it('treats a disputed Stripe charge as a financial outflow even before a refund amount is recorded', () => {
    const disputedAt = new Date('2026-09-13T15:00:00.000Z');
    const adjustments = buildReconciledRefundRecords({
      purchases: [],
      commerceOrders: [],
      purchaseRefunds: [],
      commerceRefunds: [],
      paymentRecords: [{
        id: 'disputed-payment',
        amountCents: 3_000,
        refundedAmountCents: 0,
        status: 'DISPUTED',
        occurredAt: new Date('2026-09-10T15:00:00.000Z'),
        updatedAt: disputedAt,
        userId: 'member-1',
        membershipId: null,
        purchaseId: null,
        commerceOrderId: null,
        stripeEventId: 'event-dispute',
        stripePaymentIntentId: 'pi-dispute',
        kind: 'EVENT',
      }],
    });

    expect(adjustments.map((item) => [item.amountCents, item.adjustmentType])).toEqual([
      [3_000, 'DISPUTE'],
    ]);
  });
});
