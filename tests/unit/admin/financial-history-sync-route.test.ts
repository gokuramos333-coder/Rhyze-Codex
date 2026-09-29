import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ owner: vi.fn(), sync: vi.fn(), mode: vi.fn(), auditCreate: vi.fn(), auditUpdate: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ requireApprovedOwner: mocks.owner }));
vi.mock('@/lib/payments/stripe', () => ({ stripeAccountMode: mocks.mode, stripeIsConfigured: () => true }));
vi.mock('@/lib/payments/stripe-payment-sync', () => ({ syncRecentStripePaymentRecords: mocks.sync }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { auditLog: { create: mocks.auditCreate, update: mocks.auditUpdate } } }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
import { POST } from '@/app/api/admin/payments/reconcile-history/route';

const body = { from: '2026-08-01T04:00:00Z', to: '2026-09-01T04:00:00Z', dryRun: true, reason: 'Verify August financial reporting' };
const request = (data: unknown = body, origin = 'https://rhyzefitness.com') => new Request('https://rhyzefitness.com/api/admin/payments/reconcile-history', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(data) });
describe('owner financial history reconciliation', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://rhyzefitness.com'); vi.clearAllMocks(); mocks.owner.mockResolvedValue({ id: 'owner' }); mocks.mode.mockReturnValue('live'); mocks.auditCreate.mockResolvedValue({ id: 'audit1' }); mocks.auditUpdate.mockResolvedValue({}); mocks.sync.mockResolvedValue({ attempted: true, synced: 0, wouldSync: 2, hasMore: false }); });
  it('blocks cross-origin requests before audit or payment changes', async () => {
    expect((await POST(request(body, 'https://other.test'))).status).toBe(403);
    expect(mocks.auditCreate).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it('requires approved owner authentication', async () => {
    mocks.owner.mockRejectedValue(new Error('unauthorized'));
    await expect(POST(request())).rejects.toThrow('unauthorized');
    expect(mocks.sync).not.toHaveBeenCalled();
  });
  it.each([{ ...body, dryRun: undefined }, { ...body, dryRun: 'true' }, { ...body, to: body.from }, { ...body, from: '2020-01-01T00:00:00Z' }, { ...body, actorId: 'forged' }, { ...body, maxPages: 1000 }])('rejects missing explicit mode, unsafe bounds and forged settings', async input => {
    expect((await POST(request(input))).status).toBe(400); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it('keeps preview strictly read-only while forcing bounded financial-only reconciliation', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(expect.anything(), { from: new Date(body.from), to: new Date(body.to), dryRun: true, maxPages: 1, limit: 25, financialOnly: true });
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.auditUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it('audits the authenticated actor and result when applying financial reconciliation', async () => {
    const response = await POST(request({ ...body, dryRun: false }));
    expect(response.status).toBe(200);
    expect(mocks.auditCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorId: 'owner', action: 'payments.history-sync.apply', before: { ...body, dryRun: false } }) }));
    expect(mocks.auditUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'audit1' }, data: expect.objectContaining({ after: expect.objectContaining({ status: 'COMPLETED', result: { attempted: true, synced: 0, wouldSync: 2, hasMore: false } }) }) }));
    expect(mocks.revalidate).toHaveBeenCalledWith('/admin/payments');
  });
  it('records an error without claiming no writes when a batch fails halfway', async () => {
    mocks.sync.mockRejectedValue(new Error('provider unavailable'));
    const response = await POST(request({ ...body, dryRun: false }));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ ok: false, auditId: 'audit1', possiblePartial: true });
    expect(mocks.auditUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ after: expect.objectContaining({ status: 'FAILED' }) }) }));
  });
  it('refuses test mode before any audit or payment changes', async () => {
    mocks.mode.mockReturnValue('test');
    expect((await POST(request())).status).toBe(503); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it('accepts a legacy Stripe payment cursor without widening the batch bound', async () => {
    expect((await POST(request({ ...body, startingAfter: 'py_legacy123' }))).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ startingAfter: 'py_legacy123', maxPages: 1, limit: 25 }));
  });
});
