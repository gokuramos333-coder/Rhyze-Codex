import { expect, it } from 'vitest';
import { currentCreditProduct } from '@/lib/domain/credits/current-credit-product';
import { vipCreditBenefit } from '@/lib/domain/credits/vip-access';
it('uses the current paid membership for eligibility, not the original receipt product', () => {
  const account = {
    label: 'Ritual',
    sourcePurchase: {
      product: { kind: 'VIP', includedCredits: null },
      membership: {
        id: 'm',
        product: { kind: 'LIMITED_MEMBERSHIP', includedCredits: 8 },
      },
    },
  };
  expect(currentCreditProduct(account)?.includedCredits).toBe(8);
  expect(vipCreditBenefit(account)).toBe(false);
  const upgraded = {
    ...account,
    sourcePurchase: {
      product: { kind: 'LIMITED_MEMBERSHIP', includedCredits: 4 },
      membership: { id: 'm', product: { kind: 'VIP', includedCredits: null } },
    },
  };
  expect(vipCreditBenefit(upgraded)).toBe(true);
});
it('keeps one-time purchases and historical objects without a current membership unchanged', () => {
  expect(
    currentCreditProduct({
      sourcePurchase: { product: { kind: 'DROP_IN', includedCredits: 1 } },
    })?.kind,
  ).toBe('DROP_IN');
  expect(currentCreditProduct({ sourcePurchase: null })).toBeNull();
});
