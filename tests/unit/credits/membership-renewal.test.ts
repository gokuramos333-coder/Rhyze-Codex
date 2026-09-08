import { describe, expect, it } from 'vitest';
import {
  availableMembershipCredits,
  renewalCreditReset,
} from '@/lib/domain/credits/membership-renewal';

describe('recurring membership credit renewal', () => {
  it('expires unused credits before granting the new billing-cycle allowance', () => {
    expect(
      renewalCreditReset({
        entries: [{ quantity: 8 }, { quantity: -5 }],
        includedCredits: 8,
      }),
    ).toEqual({ expirationQuantity: -3, grantQuantity: 8 });
  });

  it('does not create a negative expiration when the prior balance is exhausted', () => {
    expect(
      renewalCreditReset({
        entries: [{ quantity: 4 }, { quantity: -4 }],
        includedCredits: 4,
      }),
    ).toEqual({ expirationQuantity: 0, grantQuantity: 4 });
  });

  it('never exposes more credits than the current membership allowance', () => {
    expect(
      availableMembershipCredits({
        entries: [{ quantity: 8 }, { quantity: 1 }],
        includedCredits: 8,
      }),
    ).toBe(8);
  });
});
