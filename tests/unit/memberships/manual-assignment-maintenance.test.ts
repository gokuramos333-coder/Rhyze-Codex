import { afterEach, describe, expect, it, vi } from 'vitest';
import { assignedMembershipRecords } from '@/lib/domain/memberships/admin-membership-assignment';
import { complimentaryStandardAccessCanBook, eventCreditCanBook } from '@/lib/domain/bookings/booking-rules';
import { currentCreditProduct } from '@/lib/domain/credits/current-credit-product';
import { vipCreditAccountCanBook } from '@/lib/domain/credits/vip-access';

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/db/prisma', () => ({ prisma: new Proxy({}, { get: (_, key) => state.db[key] }) }));
vi.mock('@/lib/payments/stripe', () => ({
  stripeIsConfigured: () => false,
  getStripe: () => { throw Error('Manual assignments must not contact Stripe'); },
}));
import { POST } from '@/app/api/jobs/memberships/route';

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('bounded manual class membership maintenance', () => {
  it('preserves the assigned window across monthly maintenance without adding VIP event benefits', async () => {
    const start = new Date('2026-09-29T17:00:00Z');
    const end = new Date('2027-02-02T04:59:59.999Z');
    const product = {
      id: 'complimentary-standard', name: 'Complimentary regular classes',
      kind: 'MONTHLY_UNLIMITED', slug: 'complimentary-standard',
      customPlanType: 'COMPLIMENTARY_STANDARD', isUnlimited: true, includedCredits: null,
    };
    const records = assignedMembershipRecords({
      actorId: 'owner', userId: 'member', now: start, end,
      reason: 'Approved class-only gift', product,
    });
    const purchase = { id: 'purchase', ...records.purchase, product };
    const membership = {
      id: 'membership', ...records.membership, purchaseId: purchase.id,
      stripeSubscriptionId: null, product,
    };
    const account = {
      id: 'credits', ...records.creditAccount, sourcePurchaseId: purchase.id,
      sourcePurchase: { ...purchase, membership },
    };
    const accounts = [account];
    const legacyGift = {
      ...membership, id: 'old-unlinked-gift', purchaseId: null, status: 'EXPIRED',
      currentPeriodEnd: new Date('2026-09-01T04:00Z'),
      product: { ...product, id: 'legacy-vip', kind: 'VIP', slug: 'legacy-gift', customPlanType: null },
    };
    const memberships = [legacyGift, membership];
    state.db = {
      membershipFreeze: { findMany: async () => [] },
      // The raw jobs only backfill/expire INTRO_TRIAL records, absent here.
      $executeRaw: async () => 0,
      membership: {
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const candidate of memberships) {
            if (where.status.in.includes(candidate.status) &&
                candidate.currentPeriodEnd <= where.currentPeriodEnd.lte &&
                (!where.product.kind || where.product.kind === candidate.product.kind) &&
                (!where.product.slug || where.product.slug === candidate.product.slug)) {
              Object.assign(candidate, data);
              count++;
            }
          }
          return { count };
        },
        findMany: async ({ where }: any) =>
          memberships.filter(candidate => candidate.status === where.status && candidate.product.kind === where.product.kind)
            .map(candidate => ({ ...candidate, purchase: candidate.purchaseId ? { ...purchase, creditAccount: account } : null })),
        update: async ({ data }: any) => Object.assign(membership, data),
      },
      creditAccount: {
        findFirst: async () => null,
        create: async ({ data }: any) => { accounts.push(data); return data; },
      },
    };
    vi.stubEnv('JOB_SECRET', 'unit-test-only');
    vi.useFakeTimers();
    for (const date of ['2026-10-01T04:15:00Z', '2026-11-01T04:15:00Z', '2027-01-01T05:15:00Z', '2027-02-02T04:00:00Z']) {
      vi.setSystemTime(new Date(date));
      const response = await POST(new Request('http://localhost/api/jobs/memberships', {
        method: 'POST', headers: { authorization: 'Bearer unit-test-only' },
      }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ vipEventCreditsGranted: 0, vipUnlimitedCreditsSynced: 0 });
      expect(membership.status).toBe('ACTIVE');
      expect(membership.currentPeriodEnd).toEqual(end);
      expect(account.validUntil).toEqual(end);
      expect(accounts).toHaveLength(1);
      expect(legacyGift.status).toBe('EXPIRED');
      expect(legacyGift.currentPeriodEnd).toEqual(new Date('2026-09-01T04:00Z'));
    }
    expect(purchase.policyAcceptance).toMatchObject({ source: 'ADMIN_ASSIGNMENT', accessEndsAt: end.toISOString() });
    expect(membership.stripeSubscriptionId).toBeNull();
  });

  it('uses the current class-only plan when the historical purchase was VIP', () => {
    const product = { kind: 'MONTHLY_UNLIMITED', customPlanType: 'COMPLIMENTARY_STANDARD' };
    const account = {
      label: 'Unlimited standard classes — admin assigned',
      sourcePurchase: { product: { kind: 'VIP' }, membership: { id: 'manual', product } },
    };
    expect(currentCreditProduct(account)).toEqual(product);
    expect(vipCreditAccountCanBook({ account, memberships: [], now: new Date('2027-02-01T17:00Z') })).toBe(true);
    expect(complimentaryStandardAccessCanBook({ customPlanType: product.customPlanType, isEvent: false, durationMinutes: 50 })).toBe(true);
    expect(complimentaryStandardAccessCanBook({ customPlanType: product.customPlanType, isEvent: true, durationMinutes: 50 })).toBe(false);
    expect(eventCreditCanBook({ label: account.label, sourceProductKind: product.kind, isEvent: true })).toBe(false);
  });
});
