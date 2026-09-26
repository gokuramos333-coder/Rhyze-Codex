import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin client event refund surface', () => {
  it('keeps purchase refunds visible and adds explicit commerce event refund controls to client financials', () => {
    const page = readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');

    expect(page).toContain('refundMemberPurchaseAction');
    expect(page).toContain('Refund payment');
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
