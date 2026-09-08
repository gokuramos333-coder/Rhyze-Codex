import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('public memberships entry points', () => {
  const page = readFileSync('app/memberships/page.tsx', 'utf8');

  it('keeps each public plan CTA plan-specific through signup and member checkout', () => {
    expect(page).toContain('signedInDestination(product.slug)');
    expect(page).toContain('signedOutDestination(product.slug)');
    expect(page).toContain('/member/membership?plan=${encodeURIComponent(plan)}#available-plans');
    expect(page).toContain('/sign-up?plan=${encodeURIComponent(plan)}&callbackUrl=${encodeURIComponent(callbackUrl)}');
    expect(page).not.toContain("'/sign-in?callbackUrl=/memberships'");
  });

  it('shows the Labor Day sale code on every eligible recurring membership card while active', () => {
    expect(page).toContain('isRhyze2026PromoEligibleProduct(product)');
    expect(page).toContain('shouldShowRhyze2026PromoCopy(now)');
    expect(page).toContain('Labor Day sale: use RHYZE2026 for 20% off the first 2 months');
  });
});
