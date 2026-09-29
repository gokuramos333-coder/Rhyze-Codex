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
