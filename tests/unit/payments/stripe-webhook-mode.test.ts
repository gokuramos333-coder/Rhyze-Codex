import Stripe from 'stripe';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/payments/stripe-receipt-refresh', () => ({ eventNeedsReceipt: () => false }));
const db = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { stripeEvent: { findUnique: db.findUnique, upsert: db.upsert } } }));
import { POST } from '@/app/api/stripe/webhook/route';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('signed Stripe webhook mode boundary', () => {
  it.each([false, true])('only live events may reach production records (livemode=%s)', async (livemode) => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.rhyzefitness.com');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_local_signature_test');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_local_signature_test');
    db.findUnique.mockResolvedValue({ processedAt: new Date() });
    const payload = JSON.stringify({ id: 'evt_boundary', type: 'checkout.session.completed', livemode, data: { object: { id: 'cs_boundary' } } });
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_local_signature_test' });
    const response = await POST(new Request('https://www.rhyzefitness.com/api/stripe/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(livemode ? { received: true, duplicate: true } : { received: true, ignored: 'non-live-event' });
    expect(db.findUnique).toHaveBeenCalledTimes(livemode ? 1 : 0);
  });
});
