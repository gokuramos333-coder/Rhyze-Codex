import React from 'react';
import { formatReportMoney } from '@/lib/admin/financial-report';
import type { EventReceiptSummary as Summary } from '@/lib/admin/event-receipts';

export function EventReceiptSummary({ summary }: { summary?: Summary }) {
  if (!summary || !summary.currencies.length)
    return <p className="mt-2 text-sm">Event revenue: no matched payment records.</p>;
  return <div className="mt-2 text-sm">
    {summary.currencies.map(total => <div key={total.currency}>
      {total.currency !== 'UNKNOWN' && <>
        <p className="font-bold">Event revenue after recorded refunds: {formatReportMoney(total.netCents, total.currency)}</p>
        <p>Stripe-verified: {formatReportMoney(total.verifiedNetCents, total.currency)}
          {total.confirmedImportCents !== 0 && <> · Owner-confirmed Somble: {formatReportMoney(total.confirmedImportCents, total.currency)}</>}
        </p>
      </>}
      {total.unverifiedCents !== 0 && <p>Additional records awaiting confirmation: {formatReportMoney(total.unverifiedCents, total.currency)}</p>}
    </div>)}
    <p className="text-xs text-rhyze-black/55">All payment dates for this event, including advance sales. Before fees and instructor pay.</p>
  </div>;
}
