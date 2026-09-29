import { financialOfferingKey } from './financial-offering';
import type { FinancialReportRow } from './financial-report';

type CurrencyTotal = {
  currency: string;
  verifiedNetCents: number;
  confirmedImportCents: number;
  netCents: number;
  unverifiedCents: number;
};

function localDate(date: Date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// Input is the reconciled ledger, after exact-reference deduplication.
// Event totals span all payment dates, independently of the report's cash period.
export function summarizeEventReceipts(rows: FinancialReportRow[]) {
  const events = new Map<string, FinancialReportRow[]>();
  for (const row of rows) {
    if (!row.isEvent || !row.occurrenceId) continue;
    events.set(row.occurrenceId, [...(events.get(row.occurrenceId) || []), row]);
  }
  return [...events].map(([occurrenceId, entries]) => {
    const currencies = new Map<string, CurrencyTotal>();
    const seen = new Set<string>();
    for (const row of entries) {
      if (seen.has(row.id) || row.entryType === 'FEE') continue;
      seen.add(row.id);
      const total = currencies.get(row.currency) || {
        currency: row.currency, verifiedNetCents: 0,
        confirmedImportCents: 0, netCents: 0, unverifiedCents: 0,
      };
      const movement = ['REFUND', 'DISPUTE'].includes(row.entryType)
        ? -row.amountCents : row.amountCents;
      if (row.providerVerified) total.verifiedNetCents += movement;
      else if (row.ownerConfirmedHistorical) total.confirmedImportCents += movement;
      else total.unverifiedCents += movement;
      total.netCents = total.verifiedNetCents + total.confirmedImportCents;
      currencies.set(row.currency, total);
    }
    const dates = entries.flatMap(row => row.occurredAt ? [localDate(row.occurredAt)] : []).sort();
    return { occurrenceId, currencies: [...currencies.values()], from: dates[0], to: dates.at(-1) };
  });
}

export type EventReceiptSummary = ReturnType<typeof summarizeEventReceipts>[number];

export type EventOccurrence = {
  id: string;
  startAt: Date;
  endAt: Date;
  status: string;
  template: { name: string };
};

type DatedEventReceipts = EventReceiptSummary & { startAt: Date };
type ReceiptBucket = { events: DatedEventReceipts[]; totals: CurrencyTotal[] };

// Select by event date, then retain all reconciled payments/refunds for that event.
// This is event attribution, never an additional cash-period collection.
export function summarizeEventOccurrenceReceipts(
  summaries: EventReceiptSummary[],
  occurrences: EventOccurrence[],
  range: { start: Date; end: Date },
  now: Date,
) {
  const receipts = new Map(
    summaries.map((summary) => [summary.occurrenceId, summary]),
  );
  const groups = new Map<
    string,
    {
      name: string;
      completed: ReceiptBucket;
      upcoming: ReceiptBucket;
      cancelled: ReceiptBucket;
    }
  >();
  for (const occurrence of [...occurrences].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime(),
  )) {
    if (occurrence.startAt < range.start || occurrence.startAt > range.end)
      continue;
    const summary = receipts.get(occurrence.id);
    if (!summary) continue;
    const name = occurrence.template.name;
    const key = financialOfferingKey(name);
    const group = groups.get(key) || {
      name,
      completed: { events: [], totals: [] },
      upcoming: { events: [], totals: [] },
      cancelled: { events: [], totals: [] },
    };
    const bucket =
      occurrence.status === 'CANCELLED'
        ? group.cancelled
        : occurrence.endAt <= now
          ? group.completed
          : group.upcoming;
    bucket.events.push({ ...summary, startAt: occurrence.startAt });
    for (const currency of summary.currencies) {
      let total = bucket.totals.find(
        (item) => item.currency === currency.currency,
      );
      if (!total) {
        total = {
          currency: currency.currency,
          verifiedNetCents: 0,
          confirmedImportCents: 0,
          netCents: 0,
          unverifiedCents: 0,
        };
        bucket.totals.push(total);
      }
      total.verifiedNetCents += currency.verifiedNetCents;
      total.confirmedImportCents += currency.confirmedImportCents;
      total.netCents += currency.netCents;
      total.unverifiedCents += currency.unverifiedCents;
    }
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}
