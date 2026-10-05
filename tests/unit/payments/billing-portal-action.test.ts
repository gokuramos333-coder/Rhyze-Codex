import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  retrieve: vi.fn(),
  create: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/lib/auth/session', () => ({ requireArea: m.auth }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { user: { findUnique: m.user } },
}));
vi.mock('@/lib/payments/stripe', () => ({
  stripeConfiguration: () => ({ portal: true }),
  stripeAccountMode: () => 'live',
  getStripe: () => ({
    billingPortal: {
      configurations: { retrieve: m.retrieve },
      sessions: { create: m.create },
    },
  }),
}));
import { openStripePortalAction } from '@/app/(portal)/member/billing/actions';
const config = () => ({
  id: 'bpc_live',
  active: true,
  livemode: true,
  features: {
    payment_method_update: { enabled: true },
    invoice_history: { enabled: true },
    subscription_cancel: { enabled: false },
    subscription_update: { enabled: false },
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('STRIPE_PORTAL_CONFIGURATION_ID', 'bpc_live');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.rhyzefitness.com');
  m.auth.mockResolvedValue({ id: 'signed-in-user' });
  m.user.mockResolvedValue({ stripeCustomerId: 'cus_member' });
  m.retrieve.mockResolvedValue(config());
  m.create.mockResolvedValue({
    url: 'https://billing.stripe.com/p/session/example',
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());
describe('member billing portal', () => {
  it('handles the observed test-only configuration rejection without crashing or using the default portal', async () => {
    m.retrieve.mockRejectedValue({
      code: 'resource_missing',
      param: 'configuration',
      message: 'test-mode configuration',
    });
    m.create.mockRejectedValue({
      code: 'resource_missing',
      param: 'configuration',
      message: 'test-mode configuration',
    });
    await expect(openStripePortalAction()).rejects.toThrow(
      'redirect:/member/billing?result=portal-unavailable',
    );
    expect(m.create).not.toHaveBeenCalled();
  });
  it('opens only the signed-in member’s validated live configuration', async () => {
    await expect(openStripePortalAction()).rejects.toThrow(
      'redirect:https://billing.stripe.com/p/session/example',
    );
    expect(m.auth).toHaveBeenCalledWith('member');
    expect(m.user).toHaveBeenCalledWith({
      where: { id: 'signed-in-user' },
      select: { stripeCustomerId: true },
    });
    expect(m.retrieve).toHaveBeenCalledWith(
      'bpc_live',
      expect.objectContaining({ maxNetworkRetries: 0 }),
    );
    expect(m.create).toHaveBeenCalledWith(
      {
        customer: 'cus_member',
        configuration: 'bpc_live',
        return_url: 'https://www.rhyzefitness.com/member/billing',
      },
      expect.objectContaining({ maxNetworkRetries: 0 }),
    );
  });
  it.each([
    'inactive',
    'test',
    'cancel',
    'update',
    'no-card',
    'no-invoices',
    'wrong-id',
  ])('rejects %s configuration', async (kind) => {
    const c = config();
    if (kind === 'inactive') c.active = false;
    if (kind === 'test') c.livemode = false;
    if (kind === 'cancel') c.features.subscription_cancel.enabled = true;
    if (kind === 'update') c.features.subscription_update.enabled = true;
    if (kind === 'no-card') c.features.payment_method_update.enabled = false;
    if (kind === 'no-invoices') c.features.invoice_history.enabled = false;
    if (kind === 'wrong-id') c.id = 'bpc_other';
    m.retrieve.mockResolvedValue(c);
    await expect(openStripePortalAction()).rejects.toThrow(
      'redirect:/member/billing?result=portal-unavailable',
    );
    expect(m.create).not.toHaveBeenCalled();
  });
  it('does not silently choose a broader default when configuration is missing', async () => {
    vi.stubEnv('STRIPE_PORTAL_CONFIGURATION_ID', '');
    await expect(openStripePortalAction()).rejects.toThrow(
      'redirect:/member/billing?result=portal-unavailable',
    );
    expect(m.retrieve).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it('handles provider session failure once and shows a recoverable page', async () => {
    m.create.mockRejectedValue(new Error('private provider details'));
    await expect(openStripePortalAction()).rejects.toThrow(
      'redirect:/member/billing?result=portal-unavailable',
    );
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      'private provider details',
    );
  });
  it('does not turn authentication redirects into provider failures', async () => {
    m.auth.mockRejectedValue(new Error('redirect:/sign-in'));
    await expect(openStripePortalAction()).rejects.toThrow('redirect:/sign-in');
    expect(m.retrieve).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it('handles a missing linked customer before contacting Stripe', async () => {
    m.user.mockResolvedValue({ stripeCustomerId: null });
    await expect(openStripePortalAction()).rejects.toThrow(
      'redirect:/member/billing?result=no-stripe-customer',
    );
    expect(m.retrieve).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
});
