import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ owner: vi.fn(), reconcile: vi.fn(), mode: 'live' }));
vi.mock('@/lib/auth/session', () => ({ requireApprovedOwner: state.owner }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/payments/stripe', () => ({ stripeIsConfigured: () => true, stripeAccountMode: () => state.mode, getStripe: () => ({}) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/admin/reconcile-event-review', async original => ({ ...await original<object>(), reconcileEventReview: state.reconcile }));
import { POST } from '@/app/api/admin/payments/reconcile-event-review/route';
const input = { orderId: 'synthetic-order', bookingId: 'synthetic-booking', orderUpdatedAt: new Date(0).toISOString(), bookingUpdatedAt: new Date(0).toISOString(), reason: 'Verified synthetic repair', confirmation: 'RECONCILE' };
const request = (origin = 'https://www.rhyzefitness.com', data: object = input) => new Request('https://www.rhyzefitness.com/api/admin/payments/reconcile-event-review', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(data) });
describe('event review owner route', () => {
  beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://www.rhyzefitness.com'); vi.clearAllMocks(); state.mode = 'live'; state.owner.mockResolvedValue({ id: 'approved-owner' }); state.reconcile.mockResolvedValue({ dryRun: true }); });
  it('rejects cross-origin requests before authentication or provider verification', async () => {
    expect((await POST(request('https://other.example'))).status).toBe(403); expect(state.owner).not.toHaveBeenCalled(); expect(state.reconcile).not.toHaveBeenCalled();
  });
  it('requires the approved owner before running reconciliation', async () => {
    state.owner.mockRejectedValueOnce(Error('not an approved owner'));
    await expect(POST(request())).rejects.toThrow('not an approved owner'); expect(state.reconcile).not.toHaveBeenCalled();
  });
  it('defaults to a read-only preview and binds the actor to the authenticated owner', async () => {
    expect((await POST(request())).status).toBe(200);
    expect(state.reconcile).toHaveBeenCalledWith({}, {}, { ...input, actorId: 'approved-owner', dryRun: true });
  });
  it('rejects an actor supplied in the body', async () => {
    expect((await POST(request(undefined, { ...input, actorId: 'forged' }))).status).toBe(400); expect(state.reconcile).not.toHaveBeenCalled();
  });
  it('rejects test-mode configuration', async () => {
    state.mode = 'test'; expect((await POST(request())).status).toBe(503); expect(state.reconcile).not.toHaveBeenCalled();
  });
});
