import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  summarizeEventReceipts,
  summarizeEventOccurrenceReceipts,
} from '@/lib/admin/event-receipts';
import { EventReceiptSummary } from '@/components/admin/EventReceiptSummary';
import { FinancialReportView } from '@/components/admin/FinancialReportView';
import { buildFinancialReport } from '@/lib/admin/financial-report';
import type { FinancialReportRow } from '@/lib/admin/financial-report';

function row(
  id: string,
  extra: Partial<FinancialReportRow> = {},
): FinancialReportRow {
  return {
    id,
    occurredAt: new Date('2026-07-20T12:00:00Z'),
    amountCents: 3000,
    currency: 'USD',
    source: 'RHYZE',
    entryType: 'COLLECTION',
    providerVerified: true,
    allocationRequired: false,
    offering: 'Event',
    offeringKey: 'event',
    occurrenceId: 'august-event',
    isEvent: true,
    customer: 'Customer',
    userId: id,
    reference: id,
    providerChargeId: id,
    reviewNote: null,
    verification: 'Verified',
    purchaseId: null,
    commerceOrderId: null,
    paymentRecordId: null,
    ...extra,
  };
}

describe('complete event receipts', () => {
  it('renders $600 from $120 verified receipts plus $480 owner-confirmed imports', () => {
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => row(`stripe-${i}`)),
      ...Array.from({ length: 16 }, (_, i) =>
        row(`import-${i}`, {
          source: 'SOMBLE',
          providerVerified: false,
          ownerConfirmedHistorical: true,
        }),
      ),
    ];
    const summary = summarizeEventReceipts(rows)[0];
    expect(summary.currencies).toEqual([
      {
        currency: 'USD',
        verifiedNetCents: 12000,
        confirmedImportCents: 48000,
        netCents: 60000,
        unverifiedCents: 0,
      },
    ]);
    expect(summary.from).toBe('2026-07-20');
    const html = renderToStaticMarkup(
      <EventReceiptSummary summary={summary} />,
    );
    expect(html).toContain('$600.00');
    expect(html).toContain('$120.00');
    expect(html).toContain('$480.00');
  });
  it('counts a reconciled identity once and subtracts refunds without treating fees as revenue', () => {
    expect(
      summarizeEventReceipts([
        row('sale'),
        row('sale'),
        row('refund', { entryType: 'REFUND', amountCents: 500 }),
        row('fee', { entryType: 'FEE', amountCents: 117 }),
      ])[0].currencies[0].netCents,
    ).toBe(2500);
  });
  it('keeps other currencies, unknown imports, unmatched records and other events separate', () => {
    const result = summarizeEventReceipts([
      row('sale'),
      row('cad', { currency: 'CAD' }),
      row('unknown', {
        source: 'SOMBLE',
        currency: 'UNKNOWN',
        providerVerified: false,
      }),
      row('unmatched', { entryType: 'UNMATCHED', providerVerified: false }),
      row('other', { occurrenceId: 'other-event' }),
      row('unallocated', { occurrenceId: null }),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].currencies).toMatchObject([
      { currency: 'USD', netCents: 3000, unverifiedCents: 3000 },
      { currency: 'CAD', netCents: 3000 },
      { currency: 'UNKNOWN', netCents: 0, unverifiedCents: 3000 },
    ]);
  });
});

describe('event-date reporting', () => {
  const now = new Date('2026-09-29T16:00:00Z');
  const range = {
    start: new Date('2026-01-01T05:00:00Z'),
    end: new Date('2027-01-01T04:59:59.999Z'),
  };
  const occurrences = [
    '2026-08-03',
    '2026-09-14',
    '2026-09-28',
    '2026-10-12',
  ].map((date, i) => ({
    id: `event-${i}`,
    startAt: new Date(`${date}T16:00:00Z`),
    endAt: new Date(`${date}T17:00:00Z`),
    status: 'SCHEDULED',
    template: { name: 'Hip Hop Happy Hour with Tricia' },
  }));
  const rows = [12000, 87000, 45000, 3000]
    .map((amountCents, i) =>
      row(`receipt-${i}`, {
        occurrenceId: `event-${i}`,
        amountCents,
      }),
    )
    .concat(
      row('import', {
        occurrenceId: 'event-0',
        source: 'SOMBLE',
        providerVerified: false,
        ownerConfirmedHistorical: true,
        amountCents: 48000,
      }),
    );

  it('separates $1920 for three completed events from $30 advance sales while retaining provenance', () => {
    const [group] = summarizeEventOccurrenceReceipts(
      summarizeEventReceipts(rows),
      occurrences,
      range,
      now,
    );
    expect(group.completed.events).toHaveLength(3);
    expect(group.completed.totals).toEqual([
      {
        currency: 'USD',
        verifiedNetCents: 144000,
        confirmedImportCents: 48000,
        netCents: 192000,
        unverifiedCents: 0,
      },
    ]);
    expect(
      group.completed.events.map((event) => event.currencies[0].netCents),
    ).toEqual([60000, 87000, 45000]);
    expect(group.upcoming.totals[0].netCents).toBe(3000);
  });
  it('combines casing and with-abbreviation variants into the same event offering', () => {
    const variants = occurrences.map((event, i) => ({ ...event,
      template: {name: i === 2 ? 'HIP HOP HAPPY HOUR WITH TRICIA' : i === 3 ? 'Hip Hop Happy Hour w/ Tricia' : event.template.name},
    }));
    const result = summarizeEventOccurrenceReceipts(summarizeEventReceipts(rows), variants, range, now);
    expect(result).toHaveLength(1);
    expect(result[0].completed.totals[0].netCents).toBe(192000);
    expect(result[0].completed.events).toHaveLength(3);
    expect(result[0].upcoming.totals[0].netCents).toBe(3000);
  });
  it('labels completed and upcoming amounts separately in the report with individual event dates', () => {
    const report = buildFinancialReport(
      {
        purchases: [],
        commerceOrders: [],
        paymentRecords: [],
        sombleTransactions: [],
        purchaseRefunds: [],
        commerceRefunds: [],
        providerEvents: [],
      },
      { range: 'year' },
      now,
    );
    report.eventOccurrenceGroups = summarizeEventOccurrenceReceipts(
      summarizeEventReceipts(rows),
      occurrences,
      range,
      now,
    );
    const html = renderToStaticMarkup(
      <FinancialReportView report={report} basePath="/admin/events" />,
    );
    expect(html).toContain('COMPLETED EVENTS');
    expect(html).toContain('UPCOMING / IN PROGRESS');
    expect(html).toContain('3 events');
    for (const value of [
      '$1,920.00',
      '$30.00',
      '$600.00',
      '$870.00',
      '$450.00',
      '$1,440.00',
      '$480.00',
      'Aug 3, 2026',
      'Oct 12, 2026',
    ])
      expect(html).toContain(value);
    expect(html).toContain('Owner-confirmed Somble');
    expect(html).toContain('CASH COLLECTIONS');
  });
  it('filters on occurrence dates, includes all payment dates, and keeps canceled events separate', () => {
    const result = summarizeEventOccurrenceReceipts(
      summarizeEventReceipts(rows),
      occurrences.map((event) =>
        event.id === 'event-2' ? { ...event, status: 'CANCELLED' } : event,
      ),
      { start: new Date('2026-09-01T04:00:00Z'), end: range.end },
      now,
    );
    expect(
      result[0].completed.events.map((event) => event.occurrenceId),
    ).toEqual(['event-1']);
    expect(result[0].completed.totals[0].netCents).toBe(87000);
    expect(result[0].cancelled.totals[0].netCents).toBe(45000);
    expect(result[0].upcoming.totals[0].netCents).toBe(3000);
  });
});
