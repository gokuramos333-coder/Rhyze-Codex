import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('client referral attribution', () => {
  it('shows the instructor, code, purchase, and commission on the client profile', () => {
    const page = readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');

    expect(page).toContain('Instructor referral used');
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
