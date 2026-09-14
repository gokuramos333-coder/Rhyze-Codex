import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('client referral attribution', () => {
  it('shows the instructor, code, purchase, and commission on the client profile', () => {
    const page = readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');
    const webhook = readFileSync('lib/payments/webhook-processor.ts', 'utf8');

    expect(page).toContain('Instructor referral used');
    expect(webhook).toContain('const redeemed = await tx.discountRedemption.findUnique({ where: { purchaseId: purchase.id } })');
    expect(webhook).toContain('referralCommission.create');
    expect(page).toContain('referralCommissions');
    expect(page).toContain('referralCommission.purchase.product.name');
    expect(page).toContain('referralCommission.amountCents');
  });

  it('offers the referral field for eligible drop-in checkout', () => {
    const page = readFileSync('app/(portal)/member/membership/page.tsx', 'utf8');
    expect(page).toContain('isReferralEligibleProduct(product.kind)');
    expect(page).toContain('Instructor referral code');
    expect(page).toContain('$5 instructor commission');
  });
});
