import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('admin payment identity surface', () => {
  it('shows customer identity and Eastern date/time for native and commerce orders', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'app/(studio)/admin/payments/page.tsx'),
      'utf8',
    );

    expect(source).toContain("import { formatPaymentDateTime } from '@/lib/admin/payment-date-time'");
    expect(source).toContain('record.customerName || record.customerEmail');
    expect(source).toContain('order.customerName || order.customerEmail');
    expect(source).toContain('formatPaymentDateTime(item.paidAt || item.createdAt)');
    expect(source).toContain('formatPaymentDateTime(order.paidAt || order.createdAt)');
    expect(source).toContain('Date &amp; time');
  });
});
