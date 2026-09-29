import { describe, expect, it } from 'vitest';
import { correctManualAssignmentToClasses } from '@/lib/domain/memberships/manual-assignment-correction';

const now = new Date('2026-09-29T17:00Z');
const end = new Date('2027-02-02T04:59:59.999Z');
function fixture() {
  const credit: any = { id: 'credit', userId: 'member', sourcePurchaseId: 'purchase', isUnlimited: true, validFrom: now, validUntil: end, label: 'Gifted VIP' };
  const purchase: any = { id: 'purchase', userId: 'member', productId: 'old-vip', amountCents: 0, refundedAmountCents: 0, status: 'PAID', paidAt: now,
    stripePaymentIntentId: null, stripeCheckoutSessionId: null,
    policyAcceptance: { source: 'ADMIN_ASSIGNMENT', actorId: 'owner', reason: 'Comped', accessEndsAt: end.toISOString() }, creditAccount: credit };
  const membership: any = { id: 'membership', userId: 'member', purchaseId: purchase.id, productId: 'old-vip', status: 'ACTIVE', stripeSubscriptionId: null,
    currentPeriodStart: now, currentPeriodEnd: end, activatedAt: now, cancelAtPeriodEnd: false, planChangeState: null,
    billingLockToken: null, billingLockNeedsReview: false, freezes: [], planChanges: [], user: { status: 'ACTIVE' }, purchase };
  const product: any = { id: 'classes-only', name: 'Complimentary regular classes', kind: 'MONTHLY_UNLIMITED', customPlanType: 'COMPLIMENTARY_STANDARD',
    priceCents: 0, billingInterval: 'ONE_TIME', isUnlimited: true, isActive: true, isPublic: false, stripePriceId: null };
  const audits: any[] = [];
  const writes: any[] = [];
  const tx: any = {
    $queryRaw: async () => [],
    membership: { findFirst: async () => membership, update: async ({ data }: any) => { writes.push(data); Object.assign(membership, data); } },
    product: { findUnique: async () => product },
    creditAccount: { update: async ({ data }: any) => { writes.push(data); Object.assign(credit, data); } },
    auditLog: { create: async ({ data }: any) => { audits.push(data); } },
  };
  const input = { actorId: 'owner', userId: 'member', membershipId: 'membership', productId: 'classes-only', reason: 'Classes only; event benefit excluded' };
  return { membership, purchase, credit, product, audits, writes, tx, input };
}

describe('audited manual assignment correction', () => {
  it('does not duplicate audit or credit writes when the correction is submitted again', async () => {
    const f = fixture();
    await correctManualAssignmentToClasses(f.tx, f.input, now);
    await correctManualAssignmentToClasses(f.tx, f.input, now);
    expect(f.audits).toHaveLength(1);
    expect(f.writes).toHaveLength(2);
  });
  it('changes current benefits while preserving the original purchase and assigned time window', async () => {
    const f = fixture();
    const purchaseBefore = structuredClone({ ...f.purchase, creditAccount: undefined });
    await correctManualAssignmentToClasses(f.tx, f.input, now);
    expect(f.membership).toMatchObject({ productId: 'classes-only', status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: end, purchaseId: 'purchase', stripeSubscriptionId: null });
    expect({ ...f.purchase, creditAccount: undefined }).toEqual(purchaseBefore);
    expect(f.credit).toMatchObject({ sourcePurchaseId: 'purchase', isUnlimited: true, validFrom: now, validUntil: end, label: 'Complimentary regular classes — admin assigned' });
    expect(f.writes).toEqual([{ productId: 'classes-only' }, { label: 'Complimentary regular classes — admin assigned' }]);
    expect(f.audits).toMatchObject([{ actorId: 'owner', action: 'admin.membership-assignment-corrected', entityId: 'membership',
      before: { productId: 'old-vip', currentPeriodEnd: end.toISOString() },
      after: { productId: 'classes-only', currentPeriodEnd: end.toISOString(), reason: f.input.reason } }]);
  });
  it.each(['stripe-subscription', 'stripe-payment', 'paid', 'not-admin', 'cancelled', 'expired-window', 'changed-window', 'frozen', 'billing-review', 'pending-plan', 'disabled-member'])(
    'rejects %s without writes', async (scenario) => {
      const f = fixture();
      if (scenario === 'stripe-subscription') f.membership.stripeSubscriptionId = 'sub_paid';
      if (scenario === 'stripe-payment') f.purchase.stripePaymentIntentId = 'pi_paid';
      if (scenario === 'paid') f.purchase.amountCents = 19900;
      if (scenario === 'not-admin') f.purchase.policyAcceptance = {};
      if (scenario === 'cancelled') f.membership.status = 'CANCELLED';
      if (scenario === 'expired-window') f.membership.currentPeriodEnd = now;
      if (scenario === 'changed-window') f.credit.validUntil = new Date('2026-10-01T04:00Z');
      if (scenario === 'frozen') f.membership.freezes = [{ id: 'freeze' }];
      if (scenario === 'billing-review') f.membership.billingLockNeedsReview = true;
      if (scenario === 'pending-plan') f.membership.planChanges = [{ id: 'change' }];
      if (scenario === 'disabled-member') f.membership.user.status = 'DISABLED';
      await expect(correctManualAssignmentToClasses(f.tx, f.input, now)).rejects.toThrow();
      expect(f.writes).toEqual([]); expect(f.audits).toEqual([]);
    },
  );
  it.each(['VIP', 'paid-product', 'recurring', 'not-class-only', 'inactive'])(
    'rejects a %s target', async (scenario) => {
      const f = fixture();
      if (scenario === 'VIP') f.product.kind = 'VIP';
      if (scenario === 'paid-product') f.product.priceCents = 19900;
      if (scenario === 'recurring') f.product.billingInterval = 'MONTHLY';
      if (scenario === 'not-class-only') f.product.customPlanType = null;
      if (scenario === 'inactive') f.product.isActive = false;
      await expect(correctManualAssignmentToClasses(f.tx, f.input, now)).rejects.toThrow();
      expect(f.writes).toEqual([]);
    },
  );
});
