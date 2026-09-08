import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ADMIN financial overview surface', () => {
  it('shows current-month revenue and refunds with earnings drill-down links', () => {
    const source = readFileSync('app/(studio)/admin/page.tsx', 'utf8');

    expect(source).toContain('label="Revenue this month"');
    expect(source).toContain('label="Refunds this month"');
    expect(source).toContain("resolveAnalyticsRange({ range: 'month' }, now)");
    expect(source).toContain('href="/admin?analytics=earnings&panel=sales&range=month#earnings"');
    expect(source).toContain('href="/admin?analytics=earnings&panel=sales&range=month#refunds-analytics"');
  });

  it('keeps range-aware gross, refund, and net analytics visible', () => {
    const source = readFileSync('app/(studio)/admin/page.tsx', 'utf8');

    expect(source).toContain('id="earnings"');
    expect(source).toContain('Gross revenue');
    expect(source).toContain('Refunds issued');
    expect(source).toContain('Net revenue');
    expect(source).toContain('id="refunds-analytics"');
    expect(source).toContain('title={`Net revenue · ${range.label}`}');
    expect(source).toContain('value: point.netCents');
    expect(source).toContain('Refunds · ${range.label}');
    expect(source).toContain('<RefundedBadge />');
    expect(source).toContain('buildReconciledRevenueRecords({');
    expect(source).toContain('nativeCommerceGrossRevenueCents');
  });

  it('labels refunded sales beside the refunded payment source', () => {
    const source = readFileSync('app/(studio)/admin/payments/page.tsx', 'utf8');

    expect(source).toContain('<th>Status</th><th>Refunded amount</th>');
    expect(source).toContain('<RefundedBadge />');
    expect(source).toContain('paymentRecordSource(record)');
  });
});
