import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FinancialReportView } from '@/components/admin/FinancialReportView';
import {
  buildFinancialReport,
  financialReportCsvRows,
  type FinancialReportSources,
} from '@/lib/admin/financial-report';

describe('report page and download parity', () => {
  it('renders the full total with 50 visible rows and exports all 301 including the final page', () => {
    const at = new Date('2026-08-05T16:00:00Z');
    const sources: FinancialReportSources = {
      purchases: [],
      commerceOrders: [],
      purchaseRefunds: [],
      commerceRefunds: [],
      sombleTransactions: [],
      providerEvents: [],
      paymentRecords: Array.from({ length: 301 }, (_, i) => ({
        id: `p${i}`,
        amountCents: 100,
        refundedAmountCents: 0,
        currency: 'usd',
        status: 'SUCCEEDED',
        kind: 'PRODUCT_PURCHASE',
        userId: `u${i}`,
        purchaseId: null,
        commerceOrderId: null,
        membershipId: null,
        stripeEventId: `evt${i}`,
        stripePaymentIntentId: `pi${i}`,
        occurredAt: at,
        updatedAt: at,
        customerName: `Customer ${i}`,
      })),
    };
    const report = buildFinancialReport(sources, {
      range: 'custom',
      from: '2026-08-01',
      to: '2026-08-31',
    });
    const html = renderToStaticMarkup(
      <FinancialReportView report={report} basePath="/admin/payments" />,
    );
    const csv = financialReportCsvRows(report);
    expect(html).toContain('$301.00');
    expect(html).toContain('Download all 301 filtered entries');
    expect(html).toContain('Page 1 of 7');
    expect(csv).toHaveLength(302);
    expect(csv.slice(1).reduce((sum, row) => sum + Number(row[7]), 0)).toBe(
      30100,
    );
    expect(html).toContain(
      '/api/reports/revenue?range=custom&amp;from=2026-08-01&amp;to=2026-08-31',
    );
    expect(html).toContain('profit: unavailable');
  });
});
