import { describe, expect, it } from 'vitest';
import { formatPaymentDateTime } from '@/lib/admin/payment-date-time';

describe('admin payment date and time', () => {
  it('shows the full New York transaction timestamp', () => {
    const label = formatPaymentDateTime(new Date('2026-07-31T20:09:44.000Z'));

    expect(label).toContain('Jul 31, 2026');
    expect(label).toContain('4:09 PM');
  });
});
