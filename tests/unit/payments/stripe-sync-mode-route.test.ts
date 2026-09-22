import { afterEach, expect, it, vi } from 'vitest';
const boundary = vi.hoisted(() => ({ contacts: vi.fn(), count: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { paymentRecord: { count: boundary.count, aggregate: async () => ({ _sum: { amountCents: 0, refundedAmountCents: 0 } }) } } }));
vi.mock('@/lib/payments/stripe-payment-sync', () => ({ syncRecentStripePaymentRecords: async () => ({ attempted: false, synced: 0, reason: 'stripe-unconfigured' }) }));
vi.mock('@/lib/domain/accounts/account-contact-sync', () => ({ syncAccountContacts: boundary.contacts }));
import { POST } from '@/app/api/jobs/stripe-sync/route';
afterEach(() => vi.unstubAllEnvs());
it('stops the complete job before contact mutations when payment mode is unsafe', async () => {
  vi.stubEnv('JOB_SECRET', 'local-job-test');
  const response = await POST(new Request('https://www.rhyzefitness.com/api/jobs/stripe-sync', { method: 'POST', headers: { authorization: 'Bearer local-job-test' } }));
  expect(response.status).toBe(503);
  expect(boundary.contacts).not.toHaveBeenCalled();
  expect(boundary.count).not.toHaveBeenCalled();
});
