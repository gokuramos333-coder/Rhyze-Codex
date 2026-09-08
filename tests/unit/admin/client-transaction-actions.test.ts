import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin client transaction actions', () => {
  it('removes aggregate spending summaries and exposes transaction controls', () => {
    const page = readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');

    expect(page).not.toContain('Lifetime value');
    expect(page).not.toContain('SPENDING BY PERIOD');
    expect(page).toContain('Transaction details');
    expect(page).toContain('Refund payment');
    expect(page).toContain('Return 1 class credit');
    expect(page).toContain('Expires 14 days after return');
  });

  it('keeps Somble payments read-only while allowing courtesy credit returns', () => {
    const page = readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');

    expect(page).toContain('Original payment remains managed in Somble');
    expect(page).toContain('sourceType" value="SOMBLE');
  });

  it('full native refunds close membership access, clear source credits, and refresh Activity', () => {
    const memberAction = readFileSync('app/(studio)/admin/members/[userId]/actions.ts', 'utf8');
    const paymentsAction = readFileSync('app/(studio)/admin/payments/actions.ts', 'utf8');

    for (const source of [memberAction, paymentsAction]) {
      expect(source).toContain("data: { status: 'REFUNDED', refundedAmountCents: purchase.amountCents }");
      expect(source).toContain("data: { status: 'CANCELLED', cancelAtPeriodEnd: false");
      expect(source).toContain('sourcePurchaseId');
      expect(source).toContain("data: { validUntil:");
      expect(source).toContain("revalidatePath('/admin/activity')");
    }
  });
});
