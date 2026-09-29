import { describe, expect, it } from 'vitest';
import {
  buildFinancialReport,
  type FinancialReportSources,
} from '@/lib/admin/financial-report';
const at = new Date('2026-07-20T12:00:00Z');
function data(): FinancialReportSources {
  return {
    purchases: [],
    commerceOrders: [],
    paymentRecords: [],
    purchaseRefunds: [],
    commerceRefunds: [],
    providerEvents: [],
    sombleTransactions: [
      {
        id: 'import',
        userId: 'member',
        paymentId: 'pi_legacy',
        transferId: 'tr_legacy',
        amountCents: 3000,
        contentType: 'Event',
        transferredAt: at,
      },
    ],
    importedBookings: [
      {
        id: 'booking',
        userId: 'member',
        source: 'SOMBLE_IMPORT',
        policySnapshot: {
          importedAccessType: 'purchased',
          sourceFile: 'original-roster.csv',
        },
        occurrence: {
          id: 'aug-event',
          startAt: new Date('2026-08-03T23:15:00Z'),
          template: {
            name: 'TCJ Hip-Hop Happy Hour with Tricia',
            isEvent: true,
          },
        },
      },
    ],
  };
}
const params = { range: 'custom', from: '2026-01-01', to: '2026-12-31' };
describe('archived Somble event attribution', () => {
  it('restores a unique imported purchased event without certifying or adding cash', () => {
    const report = buildFinancialReport(data(), params);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({
      offering: 'TCJ Hip-Hop Happy Hour with Tricia',
      occurrenceId: 'aug-event',
      amountCents: 3000,
      currency: 'UNKNOWN',
      providerVerified: false,
    });
    expect(report.rows[0].reviewNote).toContain('original-roster.csv');
    expect(report.totals[0]).toMatchObject({
      importedCents: 3000,
      verifiedGrossCents: 0,
    });
  });
  it('does not allocate two generic payments across two event tickets arbitrarily', () => {
    const raw = data();
    raw.sombleTransactions.push({
      ...raw.sombleTransactions[0],
      id: 'other',
      paymentId: 'pi_other',
    });
    raw.importedBookings!.push({
      ...raw.importedBookings![0],
      id: 'other-booking',
      occurrence: {
        ...raw.importedBookings![0].occurrence,
        id: 'other-event',
        template: { name: 'Hypnotic Heels with Nicole', isEvent: true },
      },
    });
    expect(
      buildFinancialReport(raw, params).rows.every(
        (r) =>
          r.offering === 'Event' &&
          r.occurrenceId === null &&
          r.allocationRequired,
      ),
    ).toBe(true);
  });
  it.each(['OWNER_COMPLIMENTARY', 'ADMIN_ADDED', 'MEMBER'])(
    'does not value %s attendance as a purchased ticket',
    (source) => {
      const raw = data();
      raw.importedBookings![0].source = source;
      expect(buildFinancialReport(raw, params).rows[0].occurrenceId).toBeNull();
    },
  );
  it('does not treat an imported membership-credit booking as an event sale', () => {
    const raw = data();
    raw.importedBookings![0].policySnapshot = {
      importedAccessType: 'class pack',
      sourceFile: 'roster.csv',
    };
    expect(buildFinancialReport(raw, params).rows[0].occurrenceId).toBeNull();
  });
  it('does not assign a named payment to an occurrence when a generic event payment competes', () => {
    const raw = data();
    raw.sombleTransactions.push({ ...raw.sombleTransactions[0], id: 'named', paymentId: 'pi_named', contentType: 'TCJ Hip-Hop Happy Hour with Tricia' });
    expect(buildFinancialReport(raw, params).rows.every(row => row.occurrenceId === null)).toBe(true);
  });
  it('includes archived events in the event filter without relying on their title', () => {
    const raw = data();
    raw.sombleTransactions[0].contentType = 'Dance Workshop';
    raw.importedBookings![0].occurrence.template.name = 'Dance Workshop';
    expect(buildFinancialReport(raw, { ...params, kind: 'event' }).rows).toMatchObject([{ occurrenceId: 'aug-event', isEvent: true }]);
  });
  it('keeps cancelled purchased tickets as collections, without inventing refunds', () => {
    const raw = data();
    Object.assign(raw.importedBookings![0], { status: 'CANCELLED' });
    const report = buildFinancialReport(raw, params);
    expect(report.rows[0].occurrenceId).toBe('aug-event');
    expect(report.rows.some((row) => row.entryType === 'REFUND')).toBe(false);
  });
  it('does not reuse one generic payment across multiple imported purchased bookings', () => {
    const raw = data();
    raw.importedBookings!.push({
      ...raw.importedBookings![0],
      id: 'second',
      occurrence: {
        ...raw.importedBookings![0].occurrence,
        id: 'second-event',
      },
    });
    expect(buildFinancialReport(raw, params).rows[0].occurrenceId).toBeNull();
  });
  it('does not assign a later sale to an earlier occurrence', () => {
    const raw = data();
    raw.sombleTransactions[0].transferredAt = new Date('2026-08-04T12:00:00Z');
    expect(buildFinancialReport(raw, params).rows[0].occurrenceId).toBeNull();
  });
  it('keeps collection dates in July even when the event occurs in August', () => {
    expect(
      buildFinancialReport(data(), {
        range: 'custom',
        from: '2026-08-01',
        to: '2026-08-31',
      }).rows,
    ).toHaveLength(0);
  });
  it('leaves unidentified provider cash separate from an archived purchase', () => {
    const raw = data();
    raw.providerEvents = [
      {
        id: 'receipt',
        type: 'rhyze.payment.reconciled',
        payload: {
          id: 'receipt',
          livemode: true,
          account: 'acct_live',
          created: 1800000000,
          data: {
            object: {
              id: 'py_unlinked',
              object: 'charge',
              livemode: true,
              paid: true,
              captured: true,
              status: 'succeeded',
              amount: 3000,
              amount_captured: 3000,
              currency: 'usd',
              created: at.getTime() / 1000,
              refunds: { data: [] },
            },
          },
        },
      },
    ];
    const report = buildFinancialReport(raw, params);
    expect(
      report.rows.filter(
        (r) => r.providerVerified && r.entryType === 'COLLECTION',
      ),
    ).toMatchObject([
      { amountCents: 3000, occurrenceId: null, allocationRequired: true },
    ]);
    expect(report.rows.filter((r) => r.source === 'SOMBLE')).toHaveLength(1);
  });
});
