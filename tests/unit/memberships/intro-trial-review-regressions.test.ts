import { describe, expect, it, vi } from 'vitest';
import type Stripe from 'stripe';
import { cancelAdminIntroTrial } from '@/lib/domain/memberships/cancel-intro-trial';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { linkStripePaymentRecordToMember } from '@/lib/admin/stripe-payment-linking';

// Run the real writers against a stateful boundary double. PostgreSQL locking
// and rollback are separately covered by the owned-database integration suite.
function fixture() {
  const account = {
    id: 'credit',
    userId: 'member',
    isUnlimited: true,
    validUntil: null,
  };
  const product = {
    id: 'product',
    kind: 'INTRO_TRIAL',
    trialDays: 7,
    billingInterval: 'ONE_TIME',
    name: 'Synthetic trial',
  };
  const purchase = {
    id: 'purchase',
    userId: 'member',
    productId: product.id,
    status: 'PAID',
    refundedAmountCents: 0,
    paidAt: new Date(),
    amountCents: 700,
    currency: 'usd',
    discountCents: 0,
    product,
    creditAccount: account,
    user: { id: 'member', email: 'synthetic@example.test' },
  };
  const membership = {
    id: 'trial',
    userId: 'member',
    purchaseId: purchase.id,
    productId: product.id,
    status: 'TRIALING',
    stripeSubscriptionId: null,
    activatedAt: null,
    currentPeriodEnd: null,
    billingLockToken: null,
    product,
    purchase,
  };
  const bookings: any[] = [];
  const freezes: any[] = [];
  const audits: any[] = [];
  const writes = vi.fn();
  const update = (row: object) =>
    vi.fn(async ({ data }) => {
      writes(data);
      return Object.assign(row, data);
    });
  const tx: any = {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => []),
    user: {
      findUnique: async () => ({
        id: 'owner',
        status: 'ACTIVE',
        role: 'OWNER',
      }),
      update: update(purchase.user),
    },
    purchase: {
      findUnique: async () => ({ ...purchase, membership }),
      update: update(purchase),
    },
    membership: {
      findFirst: async () => membership,
      findUnique: async () => membership,
      count: async () => 1,
      update: update(membership),
      upsert: update(membership),
    },
    membershipPlanChange: { findUnique: async () => null },
    membershipFreeze: {
      findFirst: async () => freezes[0] ?? null,
      count: async () => freezes.length,
    },
    booking: { findMany: async () => bookings, update: update({}) },
    attendanceRecord: { count: async () => 0 },
    creditLedgerEntry: { count: async () => 0, findMany: async () => [] },
    creditAccount: { update: update(account), upsert: update(account) },
    paymentRecord: {
      count: async () => 0,
      updateMany: vi.fn(async (args) => {
        writes(args);
        return { count: 1 };
      }),
    },
    emailMessage: {
      findMany: async () => [],
      count: async () => 0,
      updateMany: update({}),
      upsert: update({}),
    },
    auditLog: {
      findFirst: async () => audits[0] ?? null,
      create: async ({ data }: any) => {
        const audit = { id: 'receipt', ...data };
        audits.push(audit);
        return audit;
      },
    },
  };
  const db = { $transaction: (run: (tx: any) => unknown) => run(tx) };
  const input = {
    actorId: 'owner',
    userId: 'member',
    membershipId: 'trial',
    confirmed: true,
    reason: 'Synthetic review',
  };
  const event = {
    id: 'evt_replay',
    type: 'checkout.session.completed',
    created: 1785000000,
    data: {
      object: {
        id: 'cs_trial',
        payment_status: 'paid',
        amount_total: 700,
        currency: 'usd',
        payment_intent: 'pi_trial',
        metadata: { purchaseId: purchase.id },
      },
    },
  } as unknown as Stripe.Event;
  return {
    tx,
    db,
    input,
    event,
    account,
    purchase,
    membership,
    bookings,
    freezes,
    audits,
    writes,
  };
}

describe('intro trial review regressions', () => {
  it.each(['PAID', 'PARTIALLY_REFUNDED'])(
    'checkout replay preserves a cancelled %s trial and all financial state',
    async (status) => {
      const f = fixture();
      f.purchase.status = status;
      f.purchase.refundedAmountCents =
        status === 'PARTIALLY_REFUNDED' ? 100 : 0;
      await cancelAdminIntroTrial(f.db as never, f.input);
      const before = JSON.stringify([f.purchase, f.membership, f.account]);
      f.writes.mockClear();
      await processStripeEvent(f.tx, f.event);
      expect(JSON.stringify([f.purchase, f.membership, f.account])).toBe(
        before,
      );
      expect(f.writes).not.toHaveBeenCalled();
    },
  );

  it('rechecks cancellation after waiting for the trial purchase row lock', async () => {
    const f = fixture();
    f.tx.$queryRaw.mockImplementation(async () => {
      f.membership.status = 'CANCELLED';
      f.audits.push({ id: 'receipt' });
      return [];
    });
    await processStripeEvent(f.tx, f.event);
    expect(f.membership.status).toBe('CANCELLED');
    expect(f.writes).not.toHaveBeenCalled();
  });

  it.each(['CONFIRMED', 'CANCELLED', 'LATE_CANCELLED', 'ATTENDED'])(
    'fails closed for %s future trial booking history before any cancellation writes',
    async (status) => {
      const f = fixture();
      f.bookings.push({
        id: 'booking',
        occurrenceId: 'class',
        status,
        policySnapshot: {
          accessType: 'INTRO_TRIAL',
          creditAccountId: 'credit',
        },
        occurrence: { startAt: new Date(Date.now() + 86400000), endAt: new Date(Date.now() + 90000000), template: { isEvent: false } },
      });
      await expect(
        cancelAdminIntroTrial(f.db as never, f.input),
      ).rejects.toThrow(/booking history.*review/i);
      expect(f.membership.status).toBe('TRIALING');
      expect(f.writes).not.toHaveBeenCalled();
      expect(f.audits).toHaveLength(0);
    },
  );

  it('rejects a pending freeze on an unactivated trial without changes', async () => {
    const f = fixture();
    f.freezes.push({
      id: 'pending-freeze',
      cancelledAt: null,
      activatedAt: null,
      resumedAt: null,
    });
    await expect(cancelAdminIntroTrial(f.db as never, f.input)).rejects.toThrow(
      /freeze.*review/i,
    );
    expect(f.membership.status).toBe('TRIALING');
    expect(f.writes).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'rejects a Sales grant after cancellation with payment linkage present=%s',
    async (linked) => {
      const f = fixture();
      await cancelAdminIntroTrial(f.db as never, f.input);
      f.tx.user.findFirst = async () => f.purchase.user;
      f.tx.product = { findFirst: async () => f.membership.product };
      f.tx.paymentRecord.findUnique = async () => ({
        id: 'payment',
        userId: 'member',
        purchaseId: linked ? 'purchase' : null,
        membershipId: linked ? 'trial' : null,
        amountCents: 700,
        status: 'SUCCEEDED',
        stripePaymentIntentId: 'pi_trial',
        currency: 'usd',
      });
      f.tx.paymentRecord.update = vi.fn(async (args) => {
        f.writes(args);
        return {};
      });
      const before = JSON.stringify([f.purchase, f.membership, f.account]);
      f.writes.mockClear();
      await expect(
        linkStripePaymentRecordToMember(f.tx, {
          paymentRecordId: 'payment',
          memberEmail: 'synthetic@example.test',
          grantIntroTrial: true,
        }),
      ).resolves.toMatchObject({
        ok: false,
        reason: 'intro-trial-already-granted',
      });
      expect(JSON.stringify([f.purchase, f.membership, f.account])).toBe(
        before,
      );
      expect(f.writes).not.toHaveBeenCalled();
      if (!linked) expect(f.tx.$queryRaw).toHaveBeenCalled();
    },
  );

  it.each([true, false])('permits ordinary payment linking after cancellation with linkage present=%s, without restoring access', async (linked) => {
    const f = fixture();
    await cancelAdminIntroTrial(f.db as never, f.input);
    const payment = {
      id: 'payment', userId: linked ? 'member' : null,
      purchaseId: linked ? 'purchase' : null, membershipId: linked ? 'trial' : null,
      amountCents: 700, status: 'SUCCEEDED', stripePaymentIntentId: 'pi_trial',
      currency: 'usd', customerName: null, customerEmail: null, stripeCustomerId: null,
    };
    f.tx.user.findFirst = async () => ({ ...f.purchase.user, name: 'Synthetic', stripeCustomerId: null });
    f.tx.paymentRecord.findUnique = async () => payment;
    f.tx.paymentRecord.update = async ({ data }: any) => Object.assign(payment, data);
    const before = JSON.stringify([f.purchase, f.membership, f.account]);
    await expect(linkStripePaymentRecordToMember(f.tx, {
      paymentRecordId: payment.id, memberEmail: 'synthetic@example.test', grantIntroTrial: false,
    })).resolves.toMatchObject({
      ok: true, memberId: 'member', creditAccountId: null,
      purchaseId: linked ? 'purchase' : null, membershipId: linked ? 'trial' : null,
    });
    expect(payment).toMatchObject({ userId: 'member', customerEmail: 'synthetic@example.test' });
    expect(JSON.stringify([f.purchase, f.membership, f.account])).toBe(before);
    expect(f.audits.map(audit => audit.action)).toEqual(['membership.intro_trial_cancelled', 'payment.link-member']);
  });

  it('still permits the initial Sales grant for an unmatched payment without an existing purchase', async () => {
    const f = fixture();
    f.tx.user.findFirst = async () => f.purchase.user;
    f.tx.product = { findFirst: async () => f.membership.product };
    f.tx.purchase.findUnique = async () => null;
    f.tx.purchase.create = async () => f.purchase;
    f.tx.paymentRecord.findUnique = async () => ({
      id: 'payment',
      userId: null,
      purchaseId: null,
      membershipId: null,
      amountCents: 700,
      status: 'SUCCEEDED',
      stripePaymentIntentId: 'pi_new',
      currency: 'usd',
    });
    f.tx.paymentRecord.update = vi.fn(async () => ({}));
    await expect(
      linkStripePaymentRecordToMember(f.tx, {
        paymentRecordId: 'payment',
        memberEmail: 'synthetic@example.test',
        grantIntroTrial: true,
      }),
    ).resolves.toMatchObject({
      ok: true,
      membershipId: 'trial',
      creditAccountId: 'credit',
    });
    expect(f.tx.paymentRecord.update).toHaveBeenCalledOnce();
  });
});
