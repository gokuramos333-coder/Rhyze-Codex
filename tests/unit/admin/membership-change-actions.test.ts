import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  configured: vi.fn(),
  stripe: vi.fn(),
  quote: vi.fn(),
  confirm: vi.fn(),
  recover: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ requireApprovedOwner: mocks.owner }));
vi.mock('@/lib/payments/stripe', () => ({
  stripeIsConfigured: mocks.configured,
  getStripe: mocks.stripe,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/payments/admin-plan-change', () => ({
  quoteAdminPlanChange: mocks.quote,
  confirmAdminPlanChange: mocks.confirm,
  reconcileAdminPlanChange: mocks.recover,
}));
import {
  quoteMembershipChangeAction,
  confirmMembershipChangeAction,
  reconcileMembershipChangeAction,
} from '@/app/(studio)/admin/members/[userId]/membership-change-actions';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.owner.mockResolvedValue({ id: 'owner' });
  mocks.configured.mockReturnValue(true);
});
describe('admin membership change authorization', () => {
  it.each([
    quoteMembershipChangeAction,
    confirmMembershipChangeAction,
    reconcileMembershipChangeAction,
  ])(
    'requires approved-owner authorization before accessing billing',
    async (action) => {
      mocks.owner.mockRejectedValue(new Error('not an approved owner'));
      await expect(action(new FormData())).rejects.toThrow(
        'not an approved owner',
      );
      expect(mocks.stripe).not.toHaveBeenCalled();
      expect(mocks.configured).not.toHaveBeenCalled();
      expect(mocks.quote).not.toHaveBeenCalled();
      expect(mocks.confirm).not.toHaveBeenCalled();
      expect(mocks.recover).not.toHaveBeenCalled();
    },
  );
  it('keeps the local review safe when Stripe is disconnected', async () => {
    mocks.configured.mockReturnValue(false);
    expect(await quoteMembershipChangeAction(new FormData())).toMatchObject({
      error: expect.stringContaining('No membership or payment was changed'),
    });
    expect(mocks.quote).not.toHaveBeenCalled();
  });
});
