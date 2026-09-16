import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireArea: vi.fn(),
  sync: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ requireArea: mocks.requireArea }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/payments/stripe-payment-sync', () => ({ syncRecentStripePaymentRecords: mocks.sync }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import { refreshStripePaymentsAction } from '@/app/(studio)/admin/payments/actions';

describe('manual admin Stripe reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireArea.mockResolvedValue({ id: 'admin_1' });
    mocks.sync.mockResolvedValue({ synced: 0, unchanged: 42 });
  });

  it('runs only when an admin explicitly requests it and refreshes the ledgers', async () => {
    await refreshStripePaymentsAction();

    expect(mocks.requireArea).toHaveBeenCalledWith('admin');
    expect(mocks.sync).toHaveBeenCalledOnce();
    expect(mocks.revalidate).toHaveBeenCalledWith('/admin/payments');
    expect(mocks.revalidate).toHaveBeenCalledWith('/admin');
    expect(mocks.redirect).toHaveBeenCalledWith('/admin/payments?result=refreshed#native-payment-records');
  });

  it('does not expose Stripe reconciliation to a non-admin', async () => {
    mocks.requireArea.mockRejectedValue(new Error('Unauthorized'));

    await expect(refreshStripePaymentsAction()).rejects.toThrow('Unauthorized');

    expect(mocks.sync).not.toHaveBeenCalled();
  });
});
