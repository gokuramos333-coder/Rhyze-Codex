import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin client event refund surface', () => {
  it('limits client refund navigation to verified commerce event controls', () => {
    const page = readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');

    expect(page).toContain('aria-label="Client account sections"');
    expect(page).toContain('Payments &amp; event refunds');
    expect(page).toContain('href="#payment-history"');
    expect(page).not.toContain('refundMemberPurchaseAction');
    expect(page).not.toContain('Refund payment');
    expect(page).toContain('Purchase refunds require staff review');
    expect(page).toContain('refundMemberCommerceOrderAction');
    expect(page).toContain('commerceOrderId');
    expect(page).toContain('Type REFUND to confirm');
    expect(page).toContain('Refund reason');
    expect(page).toContain('Payment intent');
    expect(page).toContain('Refund status');
    expect(page).toContain('Native Rhyze financials');
  });

  it('requires the client-owned order id and session actor action path', () => {
    const actions = readFileSync('app/(studio)/admin/members/[userId]/actions.ts', 'utf8');

    expect(actions).toContain('refundMemberCommerceOrderAction');
    expect(actions).toContain('requireApprovedOwner()');
    expect(actions).toContain('userId: formData.get');
    expect(actions).toContain('commerceOrderId: formData.get');
    expect(actions).toContain('confirmation: formData.get');
    expect(actions).toContain('reason: formData.get');
    expect(actions).toContain('memberUserId: parsed.data.userId');
    expect(actions).toContain('actorId: actor.id');
  });
});
