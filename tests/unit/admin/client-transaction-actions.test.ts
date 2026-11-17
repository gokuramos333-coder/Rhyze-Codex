import { vi } from 'vitest';
vi.mock('@/lib/auth/financial-owner-access',()=>({assertFinancialApprover:vi.fn()}));
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin client transaction actions', () => {
  it('removes aggregate spending summaries and exposes transaction controls', () => {
    const page = readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');

    expect(page).not.toContain('Lifetime value');
    expect(page).not.toContain('SPENDING BY PERIOD');
    expect(page).toContain('Transaction details');
    expect(page).not.toContain('Refund payment');
    expect(page).toContain('Purchase refunds require staff review');
    expect(page).toContain('Refund remaining cash');
    expect(page).toContain('Return 1 class credit');
    expect(page).toContain('Expires 14 days after return');
  });

  it('keeps Somble payments read-only while allowing courtesy credit returns', () => {
    const page = readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');

    expect(page).toContain('Original payment remains managed in Somble');
    expect(page).toContain('sourceType" value="SOMBLE');
  });

  it('approved one-time purchase settlement closes access and credits while renewal cash refunds retain service', () => {
    const memberAction = readFileSync('app/(studio)/admin/members/[userId]/actions.ts', 'utf8');
    const paymentsAction = readFileSync('app/(studio)/admin/payments/actions.ts', 'utf8');
    const commerceRefundHelper = readFileSync('lib/payments/commerce-refunds.ts', 'utf8');

    for (const source of [memberAction, paymentsAction]) {
      expect(source).toContain('originalPurchaseRefundPayment');
      expect(source).toContain('requestFinancialReview');
      expect(source).not.toContain('stripe.refunds.create');
    }
    const settlement = readFileSync('lib/payments/refund-review.ts','utf8');
    const approvalAction = readFileSync('app/(studio)/admin/payments/refund-reviews/actions.ts','utf8');
    expect(settlement).toMatch(/status: 'REFUNDED',\s*refundedAmountCents: purchase.amountCents/);
    expect(settlement).toMatch(/status: 'CANCELLED',\s*cancelAtPeriodEnd: false/);
    expect(settlement).toContain('sourcePurchaseId: purchase.id');
    expect(settlement).toContain('data: { validUntil: new Date() }');
    expect(settlement).toContain("operation.payload.servicePolicy !== 'PRESERVE_RECURRING_SERVICE'");
    expect(approvalAction).toContain("revalidatePath('/admin/activity')");
    expect(paymentsAction).toContain('refundCommerceOrderFullRemainder');
    expect(commerceRefundHelper).toContain('{ commerceOrderId: order.id }');
    expect(commerceRefundHelper).toContain('{ stripePaymentIntentId: order.stripePaymentIntentId }');
    expect(commerceRefundHelper).toContain("data: { status: 'CANCELLED'");
    expect(commerceRefundHelper).toContain("template: 'CLASS_REMINDER'");
  });
});
