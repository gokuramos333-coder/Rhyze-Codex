import { describe, expect, it } from 'vitest';
import { startSombleRecoveryCheckout } from '@/lib/payments/somble-recovery-checkout';

const now = new Date('2026-09-21T18:00:00Z');
function fixture() {
  const state: any = {
    purchase: null,
    sessions: [],
    created: [],
    customers: [],
    subscriptions: [],
  };
  const user = {
    id: 'cmryg3hyo000zw9wrhuigtu3y',
    email: 'jolielampkin@gmail.com',
    stripeCustomerId: 'cus_verified',
    memberships: [
      {
        id: 'cms446vaw0069l709pi1gr4yo',
        userId: 'cmryg3hyo000zw9wrhuigtu3y',
        status: 'ACTIVE',
        purchaseId: null,
        stripeSubscriptionId: null,
        product: {
          id: 'imported',
          slug: 'somble-og-rhyze-tribe',
          kind: 'LIMITED_MEMBERSHIP',
          billingInterval: 'MONTHLY',
        },
      },
    ],
  };
  const product = {
    id: 'rhyze-og-tribe-private-2026',
    slug: 'og-rhyze-tribe-2026',
    priceCents: 9200,
    kind: 'LIMITED_MEMBERSHIP',
    billingInterval: 'MONTHLY',
    includedCredits: 8,
    isUnlimited: false,
    isActive: true,
    isPublic: false,
  };
  const db: any = {
    user: {
      findUnique: async () => user,
      update: async ({ data }: any) => Object.assign(user, data),
    },
    product: { findUnique: async () => product, upsert: async () => product },
    purchase: {
      upsert: async ({ create }: any) =>
        (state.purchase ||= {
          ...create,
          stripeCheckoutSessionId: null,
          createdAt: now,
        }),
      update: async ({ data }: any) => Object.assign(state.purchase, data),
      updateMany: async ({ where, data }: any) => {
        if (
          where.policyAcceptance &&
          JSON.stringify(where.policyAcceptance.equals) !==
            JSON.stringify(state.purchase.policyAcceptance)
        )
          return { count: 0 };
        Object.assign(state.purchase, data);
        return { count: 1 };
      },
      findUnique: async () => state.purchase,
    },
  };
  const stripe: any = {
    accounts: { retrieve: async () => ({ id: 'acct_1Tu0UqRIYui0I7dP' }) },
    customers: {
      retrieve: async () => ({
        id: user.stripeCustomerId,
        email: user.email,
        metadata: { userId: user.id },
      }),
      create: async (params: any, options: any) => {
        state.customers.push({ params, options });
        return { id: 'cus_created' };
      },
    },
    subscriptions: {
      list: async () => ({ data: state.subscriptions, has_more: false }),
    },
    checkout: {
      sessions: {
        list: async () => ({ data: state.sessions, has_more: false }),
        retrieve: async (id: string) =>
          state.sessions.find((s: any) => s.id === id),
        create: async (params: any, options: any) => {
          state.created.push({ params, options });
          const existing = state.sessions.find(
            (s: any) => s.key === options.idempotencyKey,
          );
          if (existing) return existing;
          const session = {
            id: `cs_${state.sessions.length + 1}`,
            key: options.idempotencyKey,
            url: 'https://checkout.stripe.com/secure',
            status: 'open',
            payment_status: 'unpaid',
            metadata: params.metadata,
            customer: params.customer,
          };
          state.sessions.push(session);
          return session;
        },
      },
    },
  };
  const input = {
    userId: user.id,
    consent: true,
    origin: 'https://rhyzefit.com',
    now,
  };
  return { db, stripe, input, state, user, product };
}

describe('Somble recovery checkout orchestration', () => {
  it('does not silently replace an unexpected canceled provider subscription', async () => {
    const f = fixture();
    f.state.subscriptions = [{ id: 'sub_unknown', status: 'canceled' }];
    await expect(
      startSombleRecoveryCheckout(f.db, f.stripe, f.input),
    ).rejects.toThrow(/subscription/i);
    expect(f.state.created).toHaveLength(0);
  });
  it('blocks an older attempt that is unexpectedly still payable', async () => {
    const f = fixture();
    await startSombleRecoveryCheckout(f.db, f.stripe, f.input);
    f.state.purchase.policyAcceptance.attempt = 2;
    f.state.purchase.stripeCheckoutSessionId = null;
    await expect(
      startSombleRecoveryCheckout(f.db, f.stripe, f.input),
    ).rejects.toThrow(/review/i);
    expect(f.state.created).toHaveLength(1);
  });
  it('persists one pending purchase and reuses the open provider checkout', async () => {
    const f = fixture();
    expect(await startSombleRecoveryCheckout(f.db, f.stripe, f.input)).toBe(
      'https://checkout.stripe.com/secure',
    );
    await startSombleRecoveryCheckout(f.db, f.stripe, f.input);
    expect(f.state.created).toHaveLength(1);
    expect(f.state.purchase.status).toBe('PENDING');
    expect(f.state.purchase.amountCents).toBe(9200);
    expect(f.state.purchase.policyAcceptance.recovery).toBe(
      'somble-september-2026-v1',
    );
    expect(
      f.state.created[0].params.subscription_data.metadata.purchaseId,
    ).toBe(f.state.purchase.id);
  });
  it('refuses missing consent before any purchase/provider create', async () => {
    const f = fixture();
    await expect(
      startSombleRecoveryCheckout(f.db, f.stripe, {
        ...f.input,
        consent: false,
      }),
    ).rejects.toThrow(/consent/i);
    expect(f.state.purchase).toBeNull();
    expect(f.state.created).toEqual([]);
  });
  it('blocks an unknown subscription and product price drift', async () => {
    const f = fixture();
    f.state.subscriptions = [{ id: 'sub_unknown', status: 'active' }];
    await expect(
      startSombleRecoveryCheckout(f.db, f.stripe, f.input),
    ).rejects.toThrow(/subscription/i);
    expect(f.state.created).toEqual([]);
    const changed = fixture();
    changed.product.priceCents = 9609;
    await expect(
      startSombleRecoveryCheckout(changed.db, changed.stripe, changed.input),
    ).rejects.toThrow(/product/i);
    expect(changed.state.created).toEqual([]);
  });
  it('recovers an ambiguous create/save timeout without a second chargeable session', async () => {
    const f = fixture();
    const save = f.db.purchase.update;
    f.db.purchase.update = async (args: any) => {
      if (args.data.stripeCheckoutSessionId)
        throw new Error('database timeout');
      return save(args);
    };
    await expect(
      startSombleRecoveryCheckout(f.db, f.stripe, f.input),
    ).rejects.toThrow('database timeout');
    f.db.purchase.update = save;
    await startSombleRecoveryCheckout(f.db, f.stripe, f.input);
    expect(f.state.sessions).toHaveLength(1);
    expect(f.state.created).toHaveLength(1);
  });
  it('requires explicit retry and confirmed expiry before starting a new attempt', async () => {
    const f = fixture();
    await startSombleRecoveryCheckout(f.db, f.stripe, f.input);
    f.state.sessions[0].status = 'expired';
    await expect(
      startSombleRecoveryCheckout(f.db, f.stripe, f.input),
    ).rejects.toThrow(/expired/i);
    await startSombleRecoveryCheckout(f.db, f.stripe, {
      ...f.input,
      retryExpired: true,
      now: new Date('2026-09-22T18:00:00Z'),
    });
    expect(f.state.sessions).toHaveLength(2);
    expect(f.state.created[0].options.idempotencyKey).not.toBe(
      f.state.created[1].options.idempotencyKey,
    );
  });
  it('fails closed when a sessionless attempt is outside provider idempotency retention', async () => {
    const f = fixture();
    f.stripe.checkout.sessions.create = async () => {
      throw new Error('timeout');
    };
    await expect(
      startSombleRecoveryCheckout(f.db, f.stripe, f.input),
    ).rejects.toThrow('timeout');
    await expect(
      startSombleRecoveryCheckout(f.db, f.stripe, {
        ...f.input,
        now: new Date('2026-09-23T18:00:00Z'),
      }),
    ).rejects.toThrow(/review/i);
    expect(f.state.purchase.status).toBe('PENDING');
  });
});
