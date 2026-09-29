import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { summarizeEventReceipts } from '@/lib/admin/event-receipts';
import { EventReceiptSummary } from '@/components/admin/EventReceiptSummary';
import type { FinancialReportRow } from '@/lib/admin/financial-report';

function row(id: string, extra: Partial<FinancialReportRow> = {}): FinancialReportRow {
  return {
    id, occurredAt: new Date('2026-07-20T12:00:00Z'), amountCents: 3000,
    currency: 'USD', source: 'RHYZE', entryType: 'COLLECTION', providerVerified: true,
    allocationRequired: false, offering: 'Event', offeringKey: 'event',
    occurrenceId: 'august-event', isEvent: true, customer: 'Customer', userId: id,
    reference: id, providerChargeId: id, reviewNote: null, verification: 'Verified',
    purchaseId: null, commerceOrderId: null, paymentRecordId: null, ...extra,
  };
}

describe('complete event receipts', () => {
  it('renders $600 from $120 verified receipts plus $480 owner-confirmed imports', () => {
    const rows = [
      ...Array.from({length: 4}, (_,i) => row(`stripe-${i}`)),
      ...Array.from({length: 16}, (_,i) => row(`import-${i}`, {
        source: 'SOMBLE', providerVerified: false, ownerConfirmedHistorical: true,
      })),
    ];
    const summary = summarizeEventReceipts(rows)[0];
    expect(summary.currencies).toEqual([{
      currency: 'USD', verifiedNetCents: 12000, confirmedImportCents: 48000,
      netCents: 60000, unverifiedCents: 0,
    }]);
    expect(summary.from).toBe('2026-07-20');
    const html = renderToStaticMarkup(<EventReceiptSummary summary={summary} />);
    expect(html).toContain('$600.00');
    expect(html).toContain('$120.00');
    expect(html).toContain('$480.00');
  });
  it('counts a reconciled identity once and subtracts refunds without treating fees as revenue', () => {
    expect(summarizeEventReceipts([
      row('sale'), row('sale'), row('refund', {entryType: 'REFUND', amountCents: 500}),
      row('fee', {entryType: 'FEE', amountCents: 117}),
    ])[0].currencies[0].netCents).toBe(2500);
  });
  it('keeps other currencies, unknown imports, unmatched records and other events separate', () => {
    const result = summarizeEventReceipts([
      row('sale'), row('cad', {currency: 'CAD'}),
      row('unknown', {source:'SOMBLE',currency:'UNKNOWN',providerVerified:false}),
      row('unmatched', {entryType:'UNMATCHED',providerVerified:false}),
      row('other', {occurrenceId:'other-event'}),
      row('unallocated', {occurrenceId:null}),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].currencies).toMatchObject([
      {currency:'USD',netCents:3000,unverifiedCents:3000},
      {currency:'CAD',netCents:3000},
      {currency:'UNKNOWN',netCents:0,unverifiedCents:3000},
    ]);
  });
});
