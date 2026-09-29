import React from 'react';
import { EventReceiptSummary } from './EventReceiptSummary';
import Link from 'next/link';
import { AnalyticsRangeControls } from '@/components/admin/AnalyticsRangeControls';
import {
  financialReportQuery,
  formatReportMoney,
  type FinancialReport,
} from '@/lib/admin/financial-report';

export function FinancialReportView({
  report,
  basePath,
  preservedParams = {},
  ledger = true,
  summary = true,
}: {
  report: FinancialReport;
  basePath: string;
  preservedParams?: Record<string, string>;
  ledger?: boolean;
  summary?: boolean;
}) {
  const params = { ...report.params, ...preservedParams };
  const query = financialReportQuery(report.params);
  const url = (extra: Record<string, string>) =>
    `${basePath}?${new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => Boolean(v))), ...extra } as Record<string, string>)}`;
  return (
    <section className="mt-6 space-y-5" aria-label="Financial report">
      {report.params.occurrence && <EventReceiptSummary summary={report.eventSummaries.find(item => item.occurrenceId === report.params.occurrence)} />}
      {summary && (
        <>
          <AnalyticsRangeControls
            basePath={basePath}
            active={report.range.key}
            from={report.params.from}
            to={report.params.to}
            preservedParams={{
              ...preservedParams,
              ...(report.params.kind ? { kind: report.params.kind } : {}),
              ...(report.params.offering
                ? { offering: report.params.offering }
                : {}),
              ...(report.params.occurrence
                ? { occurrence: report.params.occurrence }
                : {}),
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-3xl tracking-wide">
              COLLECTIONS · {report.range.label}
            </h2>
            <Link
              href={`/api/reports/revenue?${query}`}
              className="bg-rhyze-black px-4 py-3 text-xs font-black uppercase text-white"
            >
              Download all {report.rows.length} filtered entries
            </Link>
          </div>
          <p className="text-sm text-rhyze-black/60">
            New York calendar dates. Verified totals use retained live Stripe
            receipts, including paid charges awaiting customer allocation.
            Database-only records and imported transfers remain separate. Known
            processing fees use their provider balance-transaction dates.
            Operating expenses and profit: unavailable.
          </p>
          {report.providerReceiptCount > 0 && (
            <p className="border-l-4 border-rhyze-gold bg-white p-4 text-sm">
              <strong>
                {report.providerReceiptCount} retained live receipts across
                account history.
              </strong>{' '}
              Latest receipt check:{' '}
              {report.latestReceiptReconciledAt
                ? new Date(report.latestReceiptReconciledAt).toLocaleString(
                    'en-US',
                    { timeZone: 'America/New_York' },
                  )
                : 'not recorded'}
              . Individual receipts can be older. These totals cover retained
              receipts; complete account coverage is not guaranteed. A
              historical reconciliation is needed to catch later refunds on old
              charges.
            </p>
          )}
          {report.staleProviderReceipts.length > 0 && (
            <p
              role="alert"
              className="border-l-4 border-rhyze-coral bg-white p-4 font-bold"
            >
              Refresh required: {report.staleProviderReceipts.length} retained
              receipts have newer Stripe activity. These receipts are excluded
              from verified totals; database records remain unverified.
              Reconcile the original charge creation dates, including charges
              before this report period.
            </p>
          )}
          {!report.providerReceiptCount && (
            <p className="border-l-4 border-rhyze-gold bg-white p-4 font-bold">
              Provider reconciliation required. Database records below have not
              been independently verified against retained live Stripe receipts.
            </p>
          )}
          {report.totals.map((total) => (
            <div
              key={total.currency}
              className="border-t-4 border-rhyze-orange bg-white p-5"
            >
              <h3 className="font-bold">
                {total.currency === 'UNKNOWN'
                  ? 'Imported currency not recorded'
                  : total.currency}
              </h3>
              {report.providerReceiptCount > 0 &&
                total.currency !== 'UNKNOWN' && (
                  <dl className="mt-3 grid gap-3 md:grid-cols-3">
                    {(
                      [
                        [
                          'Verified gross collections',
                          total.verifiedGrossCents,
                        ],
                        [
                          'Verified refunds / dispute movements',
                          total.verifiedRefundCents,
                        ],
                        ['Verified net after refunds', total.verifiedNetCents],
                        [
                          'Verified paid / allocation required',
                          total.unallocatedVerifiedCents,
                        ],
                      ] as const
                    ).map(([label, cents]) => (
                      <div key={label}>
                        <dt className="text-xs font-bold text-rhyze-black/55">
                          {label}
                        </dt>
                        <dd className="mt-1 text-xl font-black">
                          {formatReportMoney(cents, total.currency)}
                        </dd>
                      </div>
                    ))}
                    <div>
                      <dt className="text-xs font-bold text-rhyze-black/55">
                        Known processing fees
                      </dt>
                      <dd className="mt-1 text-xl font-black">
                        {!total.verifiedFeeEntryCount &&
                        !total.feeCoverageComplete
                          ? 'Unavailable'
                          : total.feeCoverageComplete
                            ? formatReportMoney(
                                total.verifiedFeeCents,
                                total.currency,
                              )
                            : `${formatReportMoney(total.verifiedFeeCents, total.currency)} · incomplete`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-bold text-rhyze-black/55">
                        Net after refunds and known fees
                      </dt>
                      <dd className="mt-1 text-xl font-black">
                        {total.feeCoverageComplete
                          ? formatReportMoney(
                              total.verifiedNetCents - total.verifiedFeeCents,
                              total.currency,
                            )
                          : 'Unavailable — fee evidence incomplete'}
                      </dd>
                    </div>
                  </dl>
                )}
              <dl className="mt-4 grid gap-3 border-t border-black/10 pt-3 md:grid-cols-4">
                {(
                  [
                    [
                      'Database gross / provider unverified',
                      total.unverifiedGrossCents,
                    ],
                    [
                      'Database refunds / provider unverified',
                      total.unverifiedRefundCents,
                    ],
                    ['Imported / provider unverified', total.importedCents],
                    ['Unmatched / review required', total.unmatchedCents],
                  ] as const
                ).map(([label, cents]) => (
                  <div key={label}>
                    <dt className="text-xs font-bold text-rhyze-black/55">
                      {label}
                    </dt>
                    <dd className="mt-1 text-xl font-black">
                      {formatReportMoney(cents, total.currency)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {!report.rows.length && (
            <p className="bg-white p-5">No financial entries in this range.</p>
          )}
          {report.unknownDateAdjustments.length > 0 && (
            <details className="border-l-4 border-rhyze-coral bg-white p-4">
              <summary className="font-bold">
                {report.unknownDateAdjustments.length} adjustments have no
                verified transaction date and are excluded from dated totals
              </summary>
              <ul className="mt-3 space-y-2">
                {report.unknownDateAdjustments.map((row) => (
                  <li key={row.id}>
                    {row.customer} · {row.offering} ·{' '}
                    {formatReportMoney(row.amountCents, row.currency)} ·{' '}
                    {row.reference}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <section className="overflow-x-auto bg-white p-5">
            <h3 className="font-display text-3xl">COLLECTIONS BY OFFERING</h3>
            <p className="mt-2 text-xs text-rhyze-black/55">
              Totals retain currency and source provenance. Imported amounts are
              not verified processor collections. Historical event labels use
              the preserved purchased-ticket imports only where the payment and
              event pairing is unique. Do not add imported amounts to verified
              cash; the same money may already be included in unallocated Stripe
              receipts.
            </p>
            <table className="mt-4 w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr>
                  <th>Offering</th>
                  <th>Currency</th>
                  <th>Verified gross</th>
                  <th>Verified refunds</th>
                  <th>Verified net</th>
                  <th>Database only / unverified net</th>
                  <th>Imported</th>
                  <th>Unmatched</th>
                </tr>
              </thead>
              <tbody>
                {report.offerings.flatMap((offering) =>
                  offering.totals.map((total) => (
                    <tr
                      key={`${offering.key}-${total.currency}`}
                      className="border-t border-black/10"
                    >
                      <td className="py-3">
                        <Link
                          href={url({ offering: offering.key, page: '1' })}
                          className="font-bold text-rhyze-coral"
                        >
                          {offering.name}
                        </Link>
                      </td>
                      <td>{total.currency}</td>
                      {[
                        total.verifiedGrossCents,
                        total.verifiedRefundCents,
                        total.verifiedNetCents,
                        total.unverifiedGrossCents -
                          total.unverifiedRefundCents,
                        total.importedCents,
                        total.unmatchedCents,
                      ].map((cents, i) => (
                        <td key={i}>
                          {formatReportMoney(cents, total.currency)}
                        </td>
                      ))}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
      {ledger && (
        <section
          id="refunds-analytics"
          className="overflow-x-auto bg-white p-5"
        >
          <h3 className="font-display text-3xl">FILTERED FINANCIAL ENTRIES</h3>
          <p className="mt-2 text-sm">
            {report.rows.length} entries · Page {report.page} of{' '}
            {report.pageCount}. Totals and downloads include every page.
          </p>
          <table className="mt-4 w-full min-w-[65rem] text-left text-sm">
            <thead>
              <tr>
                <th>Date (New York)</th>
                <th>Customer</th>
                <th>Offering</th>
                <th>Entry</th>
                <th>Amount</th>
                <th>Source / verification</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {report.pageRows.map((row) => (
                <tr key={row.id} className="border-t border-black/10">
                  <td className="py-3">
                    {row.occurredAt?.toLocaleString('en-US', {
                      timeZone: 'America/New_York',
                    })}
                  </td>
                  <td>
                    {row.userId ? (
                      <Link href={`/admin/members/${row.userId}`}>
                        {row.customer}
                      </Link>
                    ) : (
                      row.customer
                    )}
                  </td>
                  <td>
                    {row.occurrenceId ? (
                      <Link
                        className="text-rhyze-coral"
                        href={`/admin/payments?${financialReportQuery({ ...report.params, occurrence: row.occurrenceId })}`}
                      >
                        {row.offering} · date details
                      </Link>
                    ) : (
                      row.offering
                    )}
                  </td>
                  <td>
                    {row.entryType}
                    {row.reviewNote && (
                      <small className="block font-bold text-rhyze-coral">
                        {row.reviewNote}
                      </small>
                    )}
                  </td>
                  <td>{formatReportMoney(row.amountCents, row.currency)}</td>
                  <td>{row.verification}</td>
                  <td className="max-w-48 break-all font-mono text-xs">
                    {row.reference}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <nav className="mt-4 flex gap-4">
            {report.page > 1 && (
              <Link href={url({ page: String(report.page - 1) })}>
                Previous page
              </Link>
            )}
            {report.page < report.pageCount && (
              <Link href={url({ page: String(report.page + 1) })}>
                Next page
              </Link>
            )}
          </nav>
        </section>
      )}
    </section>
  );
}
