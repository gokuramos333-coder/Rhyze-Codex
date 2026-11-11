import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { qualifyingMembershipWhere } from '@/lib/domain/memberships/active-membership';

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    membership: { findFirst: vi.fn() },
    purchase: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    requireApprovedOwner: vi.fn(),
    findClient: vi.fn(),
    findProduct: vi.fn(),
    findMembership: vi.fn(),
    savePurchase: vi.fn(),
    createCheckoutSession: vi.fn(),
    transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)),
  };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
}));
vi.mock('@/lib/auth/session', () => ({
  requireApprovedOwner: mocks.requireApprovedOwner,
  requireArea: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findFirst: mocks.findClient },
    product: { findUnique: mocks.findProduct },
    membership: { findFirst: mocks.findMembership },
    purchase: { update: mocks.savePurchase },
    $transaction: mocks.transaction,
  },
}));
vi.mock('@/lib/payments/stripe', () => ({
  stripeIsConfigured: () => true,
  getStripe: () => ({ checkout: { sessions: { create: mocks.createCheckoutSession } } }),
}));
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: vi.fn() }));
vi.mock('@/lib/storage/object-storage', () => ({ deleteObject: vi.fn(), putPublicImage: vi.fn() }));

// Exercise the actual owner action and checkout service; only external boundaries
// are doubled. No database or Stripe connection is opened.
import { startAdminMembershipCheckoutAction } from '@/app/(studio)/admin/members/[userId]/actions';

describe('owner ordinary paid checkout after trial history', () => {
  const client = { id: 'member', email: 'synthetic@example.test', name: 'Synthetic Member', stripeCustomerId: 'cus_synthetic' };
  const product = { id: 'elevate', name: 'Elevate', kind: 'LIMITED_MEMBERSHIP', isActive: true, billingInterval: 'MONTHLY', stripePriceId: 'price_synthetic', priceCents: 9200 };
  let memberships: { id: string; status: string; product: { kind: string } }[];

  function findMembership({ where }: { where: Prisma.MembershipWhereInput }) {
    const filter = where.product as { kind: string | { in: string[] } };
    const statuses = (where.status as { in?: string[] } | undefined)?.in;
    return memberships.find(row =>
      where.userId === client.id &&
      (typeof filter.kind === 'string' ? row.product.kind === filter.kind : filter.kind.in.includes(row.product.kind)) &&
      (!statuses || statuses.includes(row.status)),
    ) ?? null;
  }

  function form() {
    const data = new FormData();
    data.set('userId', client.id);
    data.set('productId', product.id);
    return data;
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    memberships = [{ id: 'historical-trial', status: 'CANCELLED', product: { kind: 'INTRO_TRIAL' } }];
    mocks.requireApprovedOwner.mockResolvedValue({ id: 'owner', role: 'OWNER' });
    mocks.findClient.mockResolvedValue(client);
    mocks.findProduct.mockResolvedValue(product);
    mocks.findMembership.mockImplementation(findMembership);
    mocks.tx.membership.findFirst.mockImplementation(findMembership);
    mocks.tx.purchase.findFirst.mockResolvedValue(null);
    mocks.tx.purchase.create.mockResolvedValue({ id: 'purchase' });
    mocks.transaction.mockImplementation(async run => run(mocks.tx));
    mocks.createCheckoutSession.mockResolvedValue({ id: 'cs_synthetic', url: 'https://checkout.stripe.com/synthetic' });
  });

  it.each(['EXPIRED', 'CANCELLED'])('lets an owner start ordinary paid checkout after a %s trial', async status => {
    memberships[0].status = status;
    await expect(startAdminMembershipCheckoutAction(form())).rejects.toThrow('redirect:https://checkout.stripe.com/synthetic');
    expect(mocks.requireApprovedOwner).toHaveBeenCalledOnce();
    const eligibilityQuery = { where: { userId: client.id, ...qualifyingMembershipWhere }, select: { id: true } };
    expect(mocks.findMembership).toHaveBeenCalledExactlyOnceWith(eligibilityQuery);
    expect(mocks.tx.membership.findFirst).toHaveBeenCalledExactlyOnceWith(eligibilityQuery);
    expect(mocks.tx.$queryRaw).toHaveBeenCalledOnce();
    expect(mocks.tx.purchase.create).toHaveBeenCalledWith({
      data: { userId: client.id, productId: product.id, amountCents: 9200, policyAcceptance: { source: 'ADMIN_CHECKOUT' } },
      select: { id: true },
    });
    expect(mocks.createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription', customer: 'cus_synthetic',
      line_items: [{ price: 'price_synthetic', quantity: 1 }],
      client_reference_id: 'purchase',
    }), { idempotencyKey: 'admin-membership-checkout-purchase' });
    expect(mocks.savePurchase).toHaveBeenCalledWith({ where: { id: 'purchase' }, data: { stripeCheckoutSessionId: 'cs_synthetic' } });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: 'owner', action: 'ADMIN_MEMBERSHIP_CHECKOUT_STARTED' }) });
  });

  it.each(['preflight', 'transaction'])('still refuses a current membership at %s', async phase => {
    const current = { id: 'current-paid', status: 'ACTIVE', product: { kind: 'LIMITED_MEMBERSHIP' } };
    if (phase === 'preflight') memberships.push(current);
    else mocks.tx.membership.findFirst.mockResolvedValue(current);
    await expect(startAdminMembershipCheckoutAction(form())).rejects.toThrow('membership=checkout-error');
    expect(console.error).toHaveBeenCalledWith('Admin membership checkout failed', expect.objectContaining({ message: 'This client already has a current membership.' }));
    expect(mocks.tx.purchase.create).not.toHaveBeenCalled();
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('requires owner approval before looking up the client or creating checkout', async () => {
    mocks.requireApprovedOwner.mockRejectedValue(new Error('Owner approval required'));
    await expect(startAdminMembershipCheckoutAction(form())).rejects.toThrow('Owner approval required');
    expect(mocks.findClient).not.toHaveBeenCalled();
    expect(mocks.findMembership).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });
});
