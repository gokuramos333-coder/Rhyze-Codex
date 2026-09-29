import type { FinancialReportRow } from './financial-report';

// Owner confirmed on 2026-09-29 in Codex: August 3 Tricia event =
// USD 480 in these preserved imports + USD 120 already reconciled receipts.
// This is event attribution/currency evidence, not a new provider receipt.
const triciaAugustImports = new Set([
  "somble-cmscfu5vr000njr092k7nzgx6",
  "somble-cmscfu5xl0019jr098mu6shrl",
  "somble-cmscfu5wp000yjr09venlfqmy",
  "somble-cms446uxz002ul7098n6fpry4",
  "somble-cms446uyi0030l709ynytvwwt",
  "somble-cms446uzf003gl709imjzhsk8",
  "somble-cmryg3hz9003mw9wr5qnrolvm",
  "somble-cmryg3hza003ow9wrv2btnsxp",
  "somble-cmryg3hza003qw9wrwv7mxv4i",
  "somble-cmryg3hza003uw9wrdbl5i6k8",
  "somble-cmryg3hzb003ww9wr5pm50dp5",
  "somble-cmryg3hzb0040w9wrmd1ktrvx",
  "somble-cmryg3hzb0042w9wrw78bx0y7",
  "somble-cmryg3hzc0044w9wrlmiy121v",
  "somble-cmryg3hzc0046w9wrv0r797je",
  "somble-cmryg3hzc0048w9wri1fnnzkx"
]);

export function confirmHistoricalEventRow(row: FinancialReportRow): FinancialReportRow {
  if (row.source !== 'SOMBLE' || row.providerVerified ||
      row.entryType !== 'COLLECTION' || row.currency !== 'UNKNOWN' ||
      row.occurrenceId !== 'owned-event-tcj-hip-hop-happy-hour-tricia' ||
      row.amountCents !== 3000 || !triciaAugustImports.has(row.id)) return row;
  return {
    ...row,
    currency: 'USD',
    ownerConfirmedHistorical: true,
    verification: 'Owner-confirmed historical import / provider unverified',
    reviewNote: `${row.reviewNote || ''} Owner confirmed this imported event sale and USD currency on 2026-09-29; no additional cash receipt created.`,
  };
}
