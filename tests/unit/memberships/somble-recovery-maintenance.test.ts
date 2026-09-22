import type Stripe from 'stripe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { processStripeEvent } from '@/lib/payments/webhook-processor';
import { vipMonthlyBenefitWindowForDate } from '@/lib/domain/credits/vip-monthly-benefits';

const fixtureState = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: new Proxy({}, { get: (_, key) => fixtureState.db[key] }),
}));
import { POST } from '@/app/api/jobs/memberships/route';

function fixture(person: {
  userId: string;
  membershipId: string;
  accountId: string;
  email: string;
  day: number;
}) {
  const periodEnd = new Date(`2026-10-0${person.day}T16:00Z`);
  const purchaseId = `somble-september-2026-v1:${person.membershipId}`;
  const productId = 'rhyze-founding-vip-private-2026';
  const september = vipMonthlyBenefitWindowForDate(
    new Date('2026-09-21T18:00Z'),
  );
  const membership: any = {
    id: person.membershipId,
    userId: person.userId,
    purchaseId: null,
    stripeSubscriptionId: null,
    status: 'ACTIVE',
    currentPeriodStart: new Date('2026-08-03T04:00Z'),
    currentPeriodEnd: new Date('2026-09-03T04:00Z'),
    product: {
      id: 'cmrykjq1b0003w9n37dqaaeh2',
      slug: 'vip-access-pass',
      kind: 'VIP',
      billingInterval: 'MONTHLY',
    },
  };
  const user = {
    id: person.userId,
    email: person.email,
    stripeCustomerId: 'cus_verified',
    name: 'Founding member',
    memberships: [membership],
  };
  const purchase: any = {
    id: purchaseId,
    userId: person.userId,
    productId,
    amountCents: 19900,
    currency: 'usd',
    status: 'PENDING',
    policyAcceptance: {
      recovery: 'somble-september-2026-v1',
      membershipId: person.membershipId,
      customerId: 'cus_verified',
    },
    product: {
      id: productId,
      slug: 'founding-vip-private-2026',
      name: 'Founding VIP',
      priceCents: 19900,
      kind: 'VIP',
      billingInterval: 'MONTHLY',
      includedCredits: null,
      isUnlimited: true,
      isPublic: false,
      isActive: true,
    },
  };
  const accounts: any[] = [
    {
      id: person.accountId,
      userId: person.userId,
      label: september.classCreditLabel,
      isUnlimited: true,
      validFrom: september.validFrom,
      validUntil: september.validUntil,
      sourcePurchaseId: null,
    },
    {
      id: 'september_event',
      userId: person.userId,
      label: september.eventCreditLabel,
      isUnlimited: false,
      validFrom: september.validFrom,
      validUntil: september.validUntil,
      sourcePurchaseId: null,
      entries: [
        { type: 'GRANT', quantity: 1 },
        { type: 'RESERVE', quantity: -1 },
      ],
    },
    {
      id: 'manual_gift',
      userId: person.userId,
      label: 'Manual admin complimentary class',
      isUnlimited: false,
      validFrom: september.validFrom,
      validUntil: new Date('2026-11-01T04:00Z'),
      sourcePurchaseId: null,
      entries: [{ type: 'GRANT', quantity: 1 }],
    },
  ];
  const records: any[] = [];
  const db: any = {
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
    membershipFreeze: { findMany: async () => [] },
    membership: {
      findUnique: async ({ where }: any) => membership.stripeSubscriptionId === where.stripeSubscriptionId ? membership : null,
      findMany: async () => membership.status === 'ACTIVE' ? [{
        ...membership,
        purchase: membership.purchaseId ? {
          ...purchase,
          creditAccount: accounts.find(a => a.sourcePurchaseId === membership.purchaseId) ?? null,
        } : null,
      }] : [],
      updateMany: async () => ({ count: 0 }),
      update: async ({ data }: any) => Object.assign(membership, data),
    },
    user: { findUnique: async () => user },
    purchase: {
      findUnique: async () => purchase,
      update: async ({ data }: any) => Object.assign(purchase, data),
    },
    creditAccount: {
      findUnique: async ({ where }: any) =>
        accounts.find((a) => a.id === where.id) ?? null,
      findFirst: async ({ where }: any) =>
        accounts.find((a) =>
          Object.entries(where).every(([key, value]) =>
            value instanceof Date
              ? a[key]?.getTime() === value.getTime()
              : a[key] === value,
          ),
        ) ?? null,
      create: async ({ data }: any) => {
        const created = { id: `account_${accounts.length}`, ...data };
        accounts.push(created);
        return created;
      },
      update: async ({ where, data }: any) =>
        Object.assign(
          accounts.find((a) => a.id === where.id),
          data,
        ),
    },
    paymentRecord: {
      findFirst: async () => null,
      create: async ({ data }: any) => {
        records.push(data);
        return data;
      },
    },
  };
  fixtureState.db = db;
  const pay = (when: Date) =>
    processStripeEvent(db, {
      id: 'evt_vip_recovery',
      type: 'invoice.paid',
      created: when.getTime() / 1000,
      data: {
        object: {
          id: 'in_vip_recovery',
          status: 'paid',
          amount_paid: 19900,
          amount_due: 19900,
          currency: 'usd',
          customer: 'cus_verified',
          billing_reason: 'subscription_create',
          status_transitions: { paid_at: when.getTime() / 1000 },
          parent: {
            subscription_details: {
              subscription: 'sub_vip',
              metadata: {
                recovery: 'somble-september-2026-v1',
                purchaseId,
                userId: person.userId,
                membershipId: person.membershipId,
                productId,
              },
            },
          },
          payments: {
            data: [
              { payment: { type: 'payment_intent', payment_intent: 'pi_vip' } },
            ],
          },
          lines: { data: [] },
        },
      },
    } as unknown as Stripe.Event);
  const failRenewal = () =>
    processStripeEvent(db, {
      id: 'evt_vip_renewal_failed',
      type: 'invoice.payment_failed',
      created: periodEnd.getTime() / 1000 + 1,
      data: {
        object: {
          id: 'in_vip_failed',
          customer: 'cus_verified',
          amount_due: 19900,
          currency: 'usd',
          parent: {
            subscription_details: {
              subscription: 'sub_vip',
              metadata: {
                recovery: 'somble-september-2026-v1',
                purchaseId,
                userId: person.userId,
                membershipId: person.membershipId,
                productId,
              },
            },
          },
        },
      },
    } as unknown as Stripe.Event);
  return { accounts, membership, purchaseId, periodEnd, pay, failRenewal };
}
async function maintain(when: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(when));
  vi.stubEnv('JOB_SECRET', 'local-test-job');
  const response = await POST(
    new Request('http://localhost/api/jobs/memberships', {
      method: 'POST',
      headers: { authorization: 'Bearer local-test-job' },
    }),
  );
  expect(response.status).toBe(200);
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const people = [
  {
    userId: 'cmryg3hyn000uw9wrjgudtj7l',
    membershipId: 'cms446vbs006fl709vf1ay2ev',
    accountId: 'cmt0h9noi0009ji09he8j5j8r',
    email: 'amyanjum2@gmail.com',
    day: 4,
    latePayment: '2026-10-02T10:00Z',
  },
  {
    userId: 'cmryg3hy70000w9wrszwya76i',
    membershipId: 'cms446vb4006bl709io10m50p',
    accountId: 'cmt0h9npe000eji095xlgjzde',
    email: 'kimrusbach@gmail.com',
    day: 3,
    latePayment: '2026-10-01T10:00Z',
  },
];
describe('VIP recovery payment and calendar-maintenance ordering', () => {
  it.each(people)(
    'does not grant unpaid October access before $email pays, then keeps only paid-period unlimited access',
    async (person) => {
      const f = fixture(person);
      const approvedSeptember = structuredClone(f.accounts);
      await maintain('2026-09-30T18:00Z');
      expect(f.accounts).toEqual(approvedSeptember);
      await maintain('2026-10-01T04:00Z');
      expect(f.accounts).toEqual(approvedSeptember);
      await f.pay(new Date(person.latePayment));
      await maintain(person.latePayment);
      expect(f.accounts.filter((a) => a.isUnlimited)).toHaveLength(1);
      expect(f.accounts.find((a) => a.isUnlimited)).toMatchObject({
        id: person.accountId,
        sourcePurchaseId: f.purchaseId,
        validUntil: f.periodEnd,
      });
      expect(f.accounts.find((a) => a.id === 'september_event')).toEqual(
        approvedSeptember[1],
      );
      expect(f.accounts.find((a) => a.id === 'manual_gift')).toEqual(
        approvedSeptember[2],
      );
      const afterPayment = structuredClone(f.accounts);
      await f.failRenewal();
      expect(f.membership.status).toBe('PAST_DUE');
      await maintain(f.periodEnd.toISOString());
      expect(
        f.accounts.filter((a) => a.isUnlimited && a.validUntil > f.periodEnd),
      ).toHaveLength(0);
      await maintain('2026-11-01T04:00Z');
      expect(f.accounts).toEqual(afterPayment);
    },
  );
  it.each(people)(
    'does not duplicate standard access when $email pays before October maintenance',
    async (person) => {
      const f = fixture(person);
      await f.pay(new Date('2026-09-21T18:00Z'));
      await maintain('2026-10-01T04:00Z');
      await maintain('2026-10-01T06:00Z');
      expect(f.accounts.filter((a) => a.isUnlimited)).toHaveLength(1);
      expect(f.accounts.find((a) => a.isUnlimited)).toMatchObject({
        sourcePurchaseId: f.purchaseId,
        validUntil: f.periodEnd,
      });
      expect(
        f.accounts.filter((a) => a.label.includes('October 2026')),
      ).toHaveLength(1);
    },
  );
});
