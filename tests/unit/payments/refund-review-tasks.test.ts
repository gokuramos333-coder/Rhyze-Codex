import { describe, expect, it, vi } from 'vitest';
import {
  financialReviewOwners,
  assignFinancialReviewTask,
  maintainFinancialReviewTasks,
} from '@/lib/payments/refund-review-tasks';
const config = JSON.stringify({
  vanessa: { id: 'verified-v', email: 'vanessa@rhyzefit.com' },
  melissa: { id: 'verified-m', email: 'melissa@rhyzefit.com' },
  evidenceReference: 'verified-readonly-123',
});
function fixture() {
  const task = {
    id: 'review',
    createdAt: new Date('2026-01-01'),
    reason: 'Failed service',
    overdue: true,
  };
  const tx: any = {
    user: {
      findMany: async () => [
        {
          id: 'verified-v',
          email: 'vanessa@rhyzefit.com',
          role: 'OWNER',
          status: 'ACTIVE',
        },
        {
          id: 'verified-m',
          email: 'melissa@rhyzefit.com',
          role: 'OWNER',
          status: 'ACTIVE',
        },
      ],
    },
    $queryRaw: vi.fn(async () => [task]),
    $executeRaw: vi.fn(async () => 1),
    inAppNotification: { createMany: vi.fn(async () => ({ count: 2 })) },
    $transaction: async (fn: any) => fn(tx),
  };
  return { tx, task };
}
describe('joint financial tasks', () => {
  it('requires exact verified identities instead of email guesses or fallback owners', () => {
    expect(() => financialReviewOwners(undefined)).toThrow(/verified/i);
    expect(() =>
      financialReviewOwners(
        JSON.stringify({ vanessa: { id: 'x' }, melissa: { id: 'x' } }),
      ),
    ).toThrow();
    expect(financialReviewOwners(config).owners).toHaveLength(2);
  });
  it('persists both assignees and deduplicated owner notifications', async () => {
    const f = fixture();
    await assignFinancialReviewTask(
      f.tx,
      f.task,
      financialReviewOwners(config),
    );
    expect(f.tx.$executeRaw).toHaveBeenCalled();
    expect(f.tx.inAppNotification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId: 'verified-v',
          dedupeKey: 'financial-review:review:assigned:verified-v',
        }),
        expect.objectContaining({
          userId: 'verified-m',
          dedupeKey: 'financial-review:review:assigned:verified-m',
        }),
      ]),
      skipDuplicates: true,
    });
  });
  it('escalates unresolved 24-hour tasks to BOTH existing owners', async () => {
    const f = fixture();
    await maintainFinancialReviewTasks(f.tx, config);
    expect(
      f.tx.inAppNotification.createMany.mock.calls.flatMap(
        ([x]: any) => x.data,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: 'verified-v',
          dedupeKey: 'financial-review:review:overdue:verified-v',
        }),
        expect.objectContaining({
          userId: 'verified-m',
          dedupeKey: 'financial-review:review:overdue:verified-m',
        }),
      ]),
    );
  });
  it('fails closed when an assigned identity is inactive or mismatched', async () => {
    const f = fixture();
    f.tx.user.findMany = async () => [
      {
        id: 'verified-v',
        email: 'vanessa@rhyzefit.com',
        role: 'OWNER',
        status: 'INACTIVE',
      },
    ];
    await expect(
      assignFinancialReviewTask(f.tx, f.task, financialReviewOwners(config)),
    ).rejects.toThrow(/identit/i);
    expect(f.tx.inAppNotification.createMany).not.toHaveBeenCalled();
  });
});
