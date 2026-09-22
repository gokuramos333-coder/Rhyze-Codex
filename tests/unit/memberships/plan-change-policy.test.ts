import { describe, expect, it } from 'vitest';
import {
  changeEffectiveAt,
  immediateChangeParams,
  planChangeCreditAdjustment,
  scheduledChangeParams,
  validatePlanChangeProduct,
} from '@/lib/domain/memberships/plan-change-policy';

describe('admin plan change policy', () => {
  const now = new Date('2026-09-21T18:00:00Z');
  const end = new Date('2026-10-03T16:00:00Z');
  const plan = {
    id: 'new',
    kind: 'LIMITED_MEMBERSHIP',
    billingInterval: 'MONTHLY',
    isActive: true,
    stripePriceId: 'price_new',
    priceCents: 11900,
  };
  it('accepts a paid monthly membership but rejects trial, one-time, inactive, same and unpriced plans', () => {
    expect(() => validatePlanChangeProduct(plan, 'old')).not.toThrow();
    for (const invalid of [
      { id: 'old' },
      { kind: 'INTRO_TRIAL' },
      { billingInterval: 'ONE_TIME' },
      { isActive: false },
      { stripePriceId: null },
      { priceCents: 0 },
    ]) {
      expect(() =>
        validatePlanChangeProduct({ ...plan, ...invalid }, 'old'),
      ).toThrow();
    }
  });
  it('uses the exact renewal instant or studio midnight on a selected day', () => {
    expect(changeEffectiveAt('NEXT_RENEWAL', '', now, end)).toEqual(end);
    expect(changeEffectiveAt('NOW', '', now, end)).toEqual(now);
    expect(changeEffectiveAt('DATE', '2026-09-24', now, end)).toEqual(
      new Date('2026-09-24T04:00:00Z'),
    );
    expect(() => changeEffectiveAt('DATE', '2026-02-31', now, end)).toThrow();
    expect(() => changeEffectiveAt('DATE', '2026-09-20', now, end)).toThrow();
    expect(() => changeEffectiveAt('DATE', '2026-11-01', now, end)).toThrow();
  });
  it('replaces the existing item and leaves renewal unchanged, waiting for payment', () => {
    expect(immediateChangeParams('si_old', 'price_new', 1800000000)).toEqual({
      items: [{ id: 'si_old', price: 'price_new', quantity: 1 }],
      billing_cycle_anchor: 'unchanged',
      proration_behavior: 'always_invoice',
      payment_behavior: 'pending_if_incomplete',
      proration_date: 1800000000,
      expand: ['latest_invoice'],
    });
  });
  it('schedules the replacement without resetting the billing anchor or cancelling the subscription', () => {
    const result = scheduledChangeParams({
      start: 100,
      effective: 200,
      oldPriceId: 'old',
      newPriceId: 'new',
      operationId: 'op',
    });
    expect(result.end_behavior).toBe('release');
    expect(result.phases).toEqual([
      {
        start_date: 100,
        end_date: 200,
        items: [{ price: 'old', quantity: 1 }],
        proration_behavior: 'none',
      },
      {
        start_date: 200,
        duration: { interval: 'month', interval_count: 1 },
        items: [{ price: 'new', quantity: 1 }],
        billing_cycle_anchor: 'automatic',
        proration_behavior: 'always_invoice',
        metadata: { rhyzePlanChangeId: 'op' },
      },
    ]);
  });
  it.each([
    { balance: 2, used: 2, allowance: 8, expected: 4 },
    { balance: 6, used: 2, allowance: 4, expected: -4 },
    { balance: 1, used: 7, allowance: 4, expected: -4 },
    { balance: 0, used: 5, allowance: null, expected: 0 },
    { balance: 0, used: 5, allowance: 8, expected: 3 },
  ])(
    'changes allowance without giving spent credits back: $expected',
    ({ balance, used, allowance, expected }) => {
      expect(planChangeCreditAdjustment(balance, used, allowance)).toBe(
        expected,
      );
    },
  );
  it('retains overuse debt so cancelling one of eight used credits does not unlock a four-credit plan', () => {
    const balanceAfterDowngrade = planChangeCreditAdjustment(0, 8, 4);
    expect(Math.max(0, balanceAfterDowngrade + 1)).toBe(0);
  });
});
