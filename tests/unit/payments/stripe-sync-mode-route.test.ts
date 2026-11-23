import { afterEach, expect, it, vi } from 'vitest';
const boundary = vi.hoisted(() => ({
  payments: vi.fn(async () => ({
    attempted: false,
    synced: 0,
    reason: 'stripe-unconfigured',
  })),
  cleanup: vi.fn(async () => ({ paid: 0, expired: 1, pending: 0, review: 0 })),
  contacts: vi.fn(),
  count: vi.fn(),
}));
vi.mock('@/lib/payments/special-event-reconciliation', () => ({
  reconcileDueSpecialEventCheckouts: boundary.cleanup,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    paymentRecord: {
      count: boundary.count,
      aggregate: async () => ({
        _sum: { amountCents: 0, refundedAmountCents: 0 },
      }),
    },
  },
}));
vi.mock('@/lib/payments/stripe-payment-sync', () => ({
  syncRecentStripePaymentRecords: boundary.payments,
}));
vi.mock('@/lib/domain/accounts/account-contact-sync', () => ({
  syncAccountContacts: boundary.contacts,
}));
import { POST } from '@/app/api/jobs/stripe-sync/route';
afterEach(() => vi.unstubAllEnvs());
it('reports event cleanup independently and stops contact writes when payment mode is unsafe', async () => {
  vi.stubEnv('JOB_SECRET', 'local-job-test');
  const response = await POST(
    new Request('https://www.rhyzefitness.com/api/jobs/stripe-sync', {
      method: 'POST',
      headers: { authorization: 'Bearer local-job-test' },
    }),
  );
  expect((await response.json()).eventCheckouts).toMatchObject({ expired: 1 });
  expect(response.status).toBe(503);
  expect(boundary.contacts).not.toHaveBeenCalled();
  expect(boundary.count).not.toHaveBeenCalled();
});

it('finishes event cleanup when general payment synchronization throws', async () => {
  vi.stubEnv('JOB_SECRET', 'local-job-test');
  boundary.payments.mockRejectedValueOnce(new Error('unavailable'));
  const response = await POST(
    new Request('http://localhost/api/jobs/stripe-sync', {
      method: 'POST',
      headers: { authorization: 'Bearer local-job-test' },
    }),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    eventCheckouts: { expired: 1 },
  });
});
it('denies an unauthenticated job before either operation', async () => {
  vi.stubEnv('JOB_SECRET', 'local-job-test');
  vi.clearAllMocks();
  const response = await POST(
    new Request('http://localhost/api/jobs/stripe-sync', { method: 'POST' }),
  );
  expect(response.status).toBe(401);
  expect(boundary.payments).not.toHaveBeenCalled();
  expect(boundary.cleanup).not.toHaveBeenCalled();
});
