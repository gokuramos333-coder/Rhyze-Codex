import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ADMIN shared financial report surfaces', () => {
  it('uses the same report contract for overview, payments, events, reports and CSV', () => {
    for (const path of ['app/(studio)/admin/page.tsx', 'app/(studio)/admin/payments/page.tsx', 'app/(studio)/admin/events/page.tsx', 'app/(studio)/admin/reports/page.tsx']) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('loadFinancialReport');
      expect(source).toContain('<FinancialReportView');
    }
    const route = readFileSync('app/api/reports/[report]/route.ts', 'utf8');
    expect(route).toContain('financialReportCsvRows(report)');
    expect(route).toContain('new URL(request.url).searchParams');
  });
  it('does not truncate financial sources before reconciliation and exposes uncertainty', () => {
    const service = readFileSync('lib/admin/financial-report.ts', 'utf8');
    expect(service).not.toMatch(/take:\s*\d/);
    const component = readFileSync('components/admin/FinancialReportView.tsx', 'utf8');
    expect(component).toContain('Imported / provider unverified');
    expect(component).toContain('Unmatched / review required');
    expect(component.replace(/\s+/g, ' ')).toContain('Operating expenses and profit: unavailable');
    expect(component).toContain('report.pageRows.map');
    expect(component).toContain('report.rows.length');
  });
  it('keeps refund controls and per-event financial drilldowns', () => {
    expect(readFileSync('app/(studio)/admin/payments/page.tsx', 'utf8')).toContain('refundCommerceOrderAction');
    expect(readFileSync('app/(studio)/admin/events/page.tsx', 'utf8')).toContain('Financial entries');
  });
});
