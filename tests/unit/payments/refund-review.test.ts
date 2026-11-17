import { vi } from 'vitest';
vi.mock('@/lib/payments/financial-release',()=>({assertFinancialSubmission:vi.fn(async()=>{}),assertFinancialRelease:vi.fn()}));
import { describe, expect, it } from 'vitest';
import {
  verifyReceipt,
  replacementEligible,
} from '@/lib/payments/refund-review-policy';
const operation = {
  id: 'synthetic-operation',
  paymentIntentId: 'synthetic-intent',
  amountCents: 1000,
  currency: 'usd',
  chargeId: 'synthetic-charge',
};
const receipt = {
  id: 'synthetic-refund',
  operationId: operation.id,
  paymentIntentId: operation.paymentIntentId,
  chargeId: operation.chargeId,
  amountCents: 1000,
  currency: 'usd',
  status: 'succeeded',
};
describe('exact financial receipt', () => {
  it('accepts only independently bound final receipts', () =>
    expect(verifyReceipt(operation, receipt)).toBe(true));
  it.each(['operationId', 'paymentIntentId', 'chargeId', 'currency', 'status'])(
    'rejects changed %s',
    (field) =>
      expect(verifyReceipt(operation, { ...receipt, [field]: 'other' })).toBe(
        false,
      ),
  );
  it('rejects changed amount', () =>
    expect(verifyReceipt(operation, { ...receipt, amountCents: 999 })).toBe(
      false,
    ));
});
describe('replacement prerequisites', () => {
  const proof = {
    fullAttemptScan: true,
    originalCardAttached: true,
    originalFullyRefunded: true,
    consent: true,
    noShow: true,
    competingAttempt: false,
    lifetimeReplacement: false,
  };
  it('requires all proof', () => expect(replacementEligible(proof)).toBe(true));
  it.each([
    'fullAttemptScan',
    'originalCardAttached',
    'originalFullyRefunded',
    'consent',
    'noShow',
  ])('rejects missing %s', (key) =>
    expect(replacementEligible({ ...proof, [key]: false })).toBe(false),
  );
  it('never replaces twice or with a competing attempt', () => {
    expect(replacementEligible({ ...proof, lifetimeReplacement: true })).toBe(
      false,
    );
    expect(replacementEligible({ ...proof, competingAttempt: true })).toBe(
      false,
    );
  });
});

import { refundSettlementMatches } from '@/lib/payments/refund-review-policy';
describe('refund settlement accounting binding', () => {
  const proof = {
    paymentIntentId: 'pi',
    originalAmountCents: 1000,
    refundedBeforeCents: 200,
    amountCents: 800,
    currency: 'usd',
  };
  const payment = {
    stripePaymentIntentId: 'pi',
    amountCents: 1000,
    refundedAmountCents: 200,
    currency: 'usd',
  };
  it('accepts the original ledger and a webhook-first full refund', () => {
    expect(refundSettlementMatches(proof, payment)).toBe(true);
    expect(
      refundSettlementMatches(proof, { ...payment, refundedAmountCents: 1000 }),
    ).toBe(true);
  });
  it.each([
    { amountCents: 1100 },
    { currency: 'eur' },
    { stripePaymentIntentId: 'other' },
    { refundedAmountCents: 1001 },
  ])('rejects altered accounting %j', (change) => {
    expect(refundSettlementMatches(proof, { ...payment, ...change })).toBe(
      false,
    );
  });
});
