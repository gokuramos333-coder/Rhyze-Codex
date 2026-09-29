import { describe, expect, it } from 'vitest';
import { resolveAnalyticsRange } from '@/lib/admin/analytics-range';
import { buildDailyRevenueSeries, recordsInRange } from '@/lib/admin/dashboard-analytics';
import { buildReconciledRevenueRecords, buildReconciledRefundRecords } from '@/lib/admin/reconciled-financials';

const paidAt = new Date('2026-08-15T16:00:00Z');
const purchase = { id: 'p1', userId: 'u1', amountCents: 3000, paidAt, createdAt: paidAt, stripePaymentIntentId: 'pi1', product: { name: 'Class pack' } };
const payment = { id: 'r1', userId: 'u1', amountCents: 3000, occurredAt: paidAt, stripePaymentIntentId: 'pi2', purchaseId: null, commerceOrderId: null, membershipId: null, stripeEventId: 'evt1', kind: 'PRODUCT_PURCHASE' };

describe('financial integrity regressions', () => {
  it('does not reintroduce a Somble-backed purchase through the local fallback', () => {
    const records = buildReconciledRevenueRecords({ purchases: [purchase], paymentRecords: [{ ...payment, stripePaymentIntentId: 'pi1' }], commerceOrders: [], sombleTransactions: [{ id: 's1', paymentId: 'pi1', userId: 'u1', amountCents: 2800, transferredAt: paidAt, contentType: 'Classpack' }] });
    expect(records).toHaveLength(1);
    expect(records[0].source).toBe('SOMBLE');
  });
  it('keeps distinct provider charges despite equal amount, customer and date', () => {
    const records = buildReconciledRevenueRecords({ purchases: [purchase], paymentRecords: [payment], commerceOrders: [], sombleTransactions: [] });
    expect(records.reduce((sum, row) => sum + row.amountCents, 0)).toBe(6000);
    expect(records).toContainEqual(expect.objectContaining({ purchaseId: 'p1', id: 'purchase-p1' }));
    expect(records).toContainEqual(expect.objectContaining({ paymentRecordId: 'r1', id: 'payment-r1' }));
  });
  it('does not infer a payment match from customer, amount and time when an ID is absent', () => {
    const records = buildReconciledRevenueRecords({ purchases: [{ ...purchase, stripePaymentIntentId: null }], paymentRecords: [payment], commerceOrders: [], sombleTransactions: [] });
    expect(records.reduce((sum, row) => sum + row.amountCents, 0)).toBe(6000);
  });
  it('does not merge a separate renewal charge sharing the purchase link on the same day', () => {
    const records = buildReconciledRevenueRecords({ purchases: [purchase], paymentRecords: [{ ...payment, purchaseId: 'p1', kind: 'MEMBERSHIP_RENEWAL' }], commerceOrders: [], sombleTransactions: [] });
    expect(records.reduce((sum, row) => sum + row.amountCents, 0)).toBe(6000);
  });

  it.each([
    ['2026-10-31', '2026-11-02', ['Oct 31', 'Nov 1', 'Nov 2']],
    ['2026-03-07', '2026-03-09', ['Mar 7', 'Mar 8', 'Mar 9']],
  ])('renders each New York date exactly once across DST from %s', (from, to, labels) => {
    const range = resolveAnalyticsRange({ range: 'custom', from: from as string, to: to as string });
    expect(buildDailyRevenueSeries([], range.start, range.end).map(row => row.label)).toEqual(labels);
  });

  it('rejects impossible calendar dates rather than silently normalizing them', () => {
    expect(resolveAnalyticsRange({ range: 'custom', from: '2026-02-30', to: '2026-03-03' }, paidAt).key).toBe('month');
  });

  it('keeps unknown refund dates out of dated totals without losing lifetime adjustment', () => {
    const rows = buildReconciledRefundRecords({ purchases: [], commerceOrders: [], purchaseRefunds: [], commerceRefunds: [], paymentRecords: [{ ...payment, refundedAmountCents: 500, updatedAt: paidAt }] });
    expect(rows[0]).toMatchObject({ amountCents: 500, dateVerified: false });
    expect(recordsInRange(rows, new Date('2026-08-01'), new Date('2026-09-01'))).toEqual([]);
  });

  it('uses individual provider refund dates and IDs, even when the charge was later synced', () => {
    const payload = { created: 1789516800, data: { object: { payment_intent: 'pi2', refunds: { data: [
      { id: 're_first', amount: 500, status: 'succeeded', created: 1786795200 },
      { id: 're_second', amount: 700, status: 'succeeded', created: 1789473600 },
    ] } } } };
    const rows = buildReconciledRefundRecords({ purchases: [], commerceOrders: [], purchaseRefunds: [], commerceRefunds: [], paymentRecords: [{ ...payment, refundedAmountCents: 1200, updatedAt: new Date('2026-10-01') }], providerEvents: [{ id: 'evt_refund', type: 'charge.refunded', payload }] });
    expect(rows).toHaveLength(2);
    expect(rows.map(row => [row.amountCents, row.occurredAt.toISOString(), row.dateVerified])).toEqual([
      [500, '2026-08-15T12:00:00.000Z', true],
      [700, '2026-09-15T12:00:00.000Z', true],
    ]);
  });
  it('deducts the actual provider dispute amount rather than the entire charge', () => {
    const rows = buildReconciledRefundRecords({ purchases: [], commerceOrders: [], purchaseRefunds: [], commerceRefunds: [], paymentRecords: [{ ...payment, status: 'DISPUTED', refundedAmountCents: 0, updatedAt: paidAt }], providerEvents: [{ id: 'evt_dispute', type: 'charge.dispute.created', payload: { created: 1789473600, data: { object: { id: 'dp1', payment_intent: 'pi2', amount: 1000, created: 1789473600 } } } }] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amountCents: 1000, dateVerified: true, adjustmentType: 'DISPUTE' });
  });
  it('matches explicit refunds to the correct renewal charge before reconciling another renewal', () => {
    const original = { ...payment, id: 'r_august', purchaseId: 'p1', stripePaymentIntentId: 'pi1', refundedAmountCents: 500, updatedAt: paidAt };
    const renewal = { ...original, id: 'r_september', stripePaymentIntentId: 'pi2' };
    const providerEvents = [
      { id: 'e1', type: 'refund.updated', payload: { created: 1786795200, data: { object: { id: 're_aug', payment_intent: 'pi1', amount: 500, status: 'succeeded', created: 1786795200 } } } },
      { id: 'e2', type: 'refund.updated', payload: { created: 1789473600, data: { object: { id: 're_sep', payment_intent: 'pi2', amount: 500, status: 'succeeded', created: 1789473600 } } } },
    ];
    const rows = buildReconciledRefundRecords({ purchases: [purchase], commerceOrders: [], purchaseRefunds: [{ id: 'explicit_aug', purchaseId: 'p1', amountCents: 500, stripeRefundId: 're_aug', createdAt: paidAt }], commerceRefunds: [], paymentRecords: [renewal, original], providerEvents });
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.dateVerified)).toBe(true);
    expect(rows.map(row => row.occurredAt.toISOString()).sort()).toEqual(['2026-08-15T12:00:00.000Z', '2026-09-15T12:00:00.000Z']);
  });
});
