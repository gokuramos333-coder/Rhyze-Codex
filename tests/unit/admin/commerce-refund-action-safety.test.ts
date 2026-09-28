import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireApprovedOwner: vi.fn(),
  refundHelper: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  requireArea: vi.fn(),
  requireApprovedOwner: mocks.requireApprovedOwner,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {},
}));

vi.mock('@/lib/payments/stripe', () => ({
  stripeIsConfigured: () => true,
  getStripe: () => ({ refunds: {}, paymentIntents: {}, charges: {} }),
}));

vi.mock('@/lib/payments/commerce-refunds', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payments/commerce-refunds')>();
  return {
    ...actual,
    refundCommerceOrderFullRemainder: mocks.refundHelper,
  };
});

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

describe('commerce refund server action safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the session actor, explicit confirmation and helper gate; pending provider state exits without success revalidation', async () => {
    const { CommerceRefundError } = await import('@/lib/payments/commerce-refunds');
    mocks.requireApprovedOwner.mockResolvedValue({
      id: 'owner_test',
      email: 'owner@example.test',
      name: 'Owner',
      role: 'OWNER',
    });
    mocks.refundHelper.mockRejectedValue(
      new CommerceRefundError('provider_pending', 'Stripe refund is pending.'),
    );

    const { refundCommerceOrderAction } = await import(
      '@/app/(studio)/admin/payments/actions'
    );
    const form = new FormData();
    form.set('orderId', 'order_event_refund_pending');
    form.set('reason', 'Studio postponed event');
    form.set('confirmation', 'REFUND');

    await expect(refundCommerceOrderAction(form)).rejects.toThrow(
      'redirect:/admin/payments?result=refund-pending#native-payment-records',
    );

    expect(mocks.refundHelper).toHaveBeenCalledWith(
      {},
      { refunds: {}, paymentIntents: {}, charges: {} },
      {
        orderId: 'order_event_refund_pending',
        actorId: 'owner_test',
        reason: 'Studio postponed event',
        confirmation: 'REFUND',
      },
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([undefined, 'email', 'staff_only'])('passes the client-owned order, owner actor and notification preference (%s)', async (notificationMode) => {
    mocks.requireApprovedOwner.mockResolvedValue({
      id: 'owner_test',
      email: 'owner@example.test',
      name: 'Owner',
      role: 'OWNER',
    });
    mocks.refundHelper.mockResolvedValue({
      status: 'SUCCEEDED',
      orderId: 'order_event_refund',
      amountCents: 3000,
      currency: 'usd',
      stripeRefundId: 're_event_refund',
    });

    const { refundMemberCommerceOrderAction } = await import(
      '@/app/(studio)/admin/members/[userId]/actions'
    );
    const form = new FormData();
    form.set('userId', 'member_event_refund');
    form.set('commerceOrderId', 'order_event_refund');
    if (notificationMode) form.set('notificationMode', notificationMode);
    form.set('reason', 'Studio postponed event');
    form.set('confirmation', 'REFUND');

    await expect(refundMemberCommerceOrderAction(form)).rejects.toThrow(
      'redirect:/admin/members/member_event_refund?sent=refund#payment-history',
    );

    expect(mocks.refundHelper).toHaveBeenCalledWith(
      {},
      { refunds: {}, paymentIntents: {}, charges: {} },
      {
        orderId: 'order_event_refund',
        memberUserId: 'member_event_refund',
        notifyCustomer: notificationMode !== 'staff_only',
        actorId: 'owner_test',
        reason: 'Studio postponed event',
        confirmation: 'REFUND',
      },
    );
  });
});
