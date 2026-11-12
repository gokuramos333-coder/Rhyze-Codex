import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: new Proxy({}, { get: (_, key) => state.db[key] }),
}));
vi.mock('@/lib/payments/stripe', () => ({
  stripeIsConfigured: () => false,
  getStripe: () => {
    throw Error('No provider calls for a one-time trial');
  },
}));
import { POST } from '@/app/api/jobs/memberships/route';

afterEach(() => vi.unstubAllEnvs());

function fixture(phase: 'start' | 'end', cancelled: boolean) {
  const membership = {
    id: 'trial',
    userId: 'member',
    status: cancelled ? 'CANCELLED' : phase === 'start' ? 'TRIALING' : 'PAUSED',
    stripeSubscriptionId: null,
    product: { kind: 'INTRO_TRIAL' },
  };
  const freeze = {
    id: 'freeze',
    membershipId: membership.id,
    startAt: new Date(0),
    endAt: new Date(1),
    cancelledAt: null,
    activatedAt: phase === 'end' ? new Date(0) : null,
    resumedAt: null,
    membership,
  };
  // Job selection can be stale by the time the transaction starts.
  const stale = {
    ...freeze,
    membership: {
      ...membership,
      status: phase === 'start' ? 'TRIALING' : 'PAUSED',
    },
  };
  const membershipUpdate = vi.fn(async ({ data }) =>
    Object.assign(membership, data),
  );
  const freezeUpdate = vi.fn(async ({ data }) => Object.assign(freeze, data));
  const tx: any = {
    booking: { findMany: async () => [] }, // This trial fixture has no advance VIP reservations.
    $executeRaw: vi.fn(async () => 0),
    $queryRaw: vi.fn(async () => []),
    membership: {
      findUnique: async () => membership,
      update: membershipUpdate,
      updateMany: async () => ({ count: 0 }),
      findMany: async () => [],
    },
    membershipFreeze: {
      findMany: async ({ where }: any) =>
        (where.activatedAt === null) === (phase === 'start') ? [stale] : [],
      findUnique: async () => freeze,
      update: freezeUpdate,
    },
    auditLog: {
      findFirst: async () => (cancelled ? { id: 'cancel-receipt' } : null),
    },
    $transaction: async (work: any) =>
      typeof work === 'function' ? work(tx) : Promise.all(work),
  };
  state.db = tx;
  vi.stubEnv('JOB_SECRET', 'unit-test');
  return { membership, freeze, membershipUpdate, freezeUpdate, tx };
}

it.each(['start', 'end'] as const)(
  'maintenance cannot %s a stale freeze after trial cancellation',
  async (phase) => {
    const f = fixture(phase, true);
    const response = await POST(
      new Request('http://localhost/api/jobs/memberships', {
        method: 'POST',
        headers: { authorization: 'Bearer unit-test' },
      }),
    );
    expect(await response.json()).toMatchObject({
      freezesStarted: 0,
      freezesResumed: 0,
      freezeErrors: [],
    });
    expect(f.membership.status).toBe('CANCELLED');
    expect(f.membershipUpdate).not.toHaveBeenCalled();
    expect(f.freezeUpdate).not.toHaveBeenCalled();
  },
);

it.each(['start', 'end'] as const)(
  'maintenance can still %s an eligible trial freeze once',
  async (phase) => {
    const f = fixture(phase, false);
    const run = () =>
      POST(
        new Request('http://localhost/api/jobs/memberships', {
          method: 'POST',
          headers: { authorization: 'Bearer unit-test' },
        }),
      );
    await run();
    expect(f.membership.status).toBe(phase === 'start' ? 'PAUSED' : 'ACTIVE');
    await run();
    expect(f.membershipUpdate).toHaveBeenCalledTimes(1);
    expect(f.freezeUpdate).toHaveBeenCalledTimes(1);
  },
);
