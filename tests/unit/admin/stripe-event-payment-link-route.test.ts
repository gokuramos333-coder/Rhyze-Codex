import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ owner: vi.fn(), link: vi.fn(), revalidate: vi.fn(), mode: vi.fn(() => 'live') }));
vi.mock('@/lib/auth/session', () => ({ requireApprovedOwner: mocks.owner }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/lib/payments/stripe', () => ({ getStripe: () => ({}), stripeAccountMode: mocks.mode, stripeIsConfigured: () => true }));
vi.mock('@/lib/admin/stripe-event-payment-linking', async (actual) => ({ ...await actual<object>(), linkStripeEventPayment: mocks.link }));
import { POST } from '@/app/api/admin/payments/link-event/route';
import { StripeEventPaymentLinkError } from '@/lib/admin/stripe-event-payment-linking';
const body = { paymentIntentId: 'pi_example', userId: 'member', occurrenceId: 'event', amountCents: 3000, currency: 'usd', markAttended: false, reason: 'Owner verified the Stripe receipt' };
const request = (data: unknown = body, origin = 'https://rhyzefitness.com') => new Request('https://rhyzefitness.com/api/admin/payments/link-event', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(data) });
describe('owner external event payment route', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://rhyzefitness.com'); vi.clearAllMocks(); mocks.owner.mockResolvedValue({ id: 'owner' }); mocks.mode.mockReturnValue('live'); mocks.link.mockResolvedValue({ orderId: 'order', bookingId: 'booking', alreadyLinked: false }); });
  it('rejects cross-origin requests before any mutation', async () => {
    expect((await POST(request(body, 'https://other.example'))).status).toBe(403);
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it('requires an approved owner before invoking reconciliation', async () => {
    mocks.owner.mockRejectedValue(new Error('unauthorized'));
    await expect(POST(request())).rejects.toThrow('unauthorized');
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it('rejects test Stripe environments', async () => {
    mocks.mode.mockReturnValue('test');
    expect((await POST(request())).status).toBe(503);
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it.each([{ ...body, markAttended: undefined }, { ...body, markAttended: 'true' }, { ...body, amountCents: 30.5 }, { ...body, actorId: 'forged' }])('requires explicit typed choices and disallows forged actor IDs', async (invalid) => {
    expect((await POST(request(invalid))).status).toBe(400);
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it('takes audit actor from the authenticated session and preserves explicit attendance choice', async () => {
    expect((await POST(request())).status).toBe(200);
    expect(mocks.link).toHaveBeenCalledWith({}, {}, { ...body, actorId: 'owner' });
    expect(mocks.revalidate).toHaveBeenCalledWith('/admin/schedule/event/roster');
  });
  it('returns reconciliation conflicts without implying a new charge', async () => {
    mocks.link.mockRejectedValue(new StripeEventPaymentLinkError('Event is full'));
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Event is full' });
  });
});
