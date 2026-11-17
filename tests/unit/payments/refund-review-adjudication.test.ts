import { describe, expect, it, vi } from 'vitest';
import { adjudicateFinancialReview } from '@/lib/payments/refund-review';
function fixture() {
  const review: any = {
    id: 'review',
    paymentRecordId: 'payment',
    version: 3,
    resolvedAt: null,
    basis: { kind: 'PAYMENT_REFUND', snapshot: 'old' },
  };
  const operations: any[] = [];
  const tx: any = {
    user: {
      findUnique: async () => ({
        role: 'OWNER',
        status: 'ACTIVE',
        email: 'melissa@rhyzefit.com',
      }),
    },
    paymentRecord: {
      findUniqueOrThrow: async () => ({
        id: 'payment',
        bookingId: null,
        stripePaymentIntentId: 'pi',
      }),
    },
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async (sql: TemplateStringsArray) =>
      sql.join('').includes('ApprovedFinancialOperation')
        ? operations
        : [review],
    ),
    auditLog: { create: vi.fn(async () => ({})) },
    $transaction: async (fn: any) => fn(tx),
  };
  return {
    tx,
    review,
    operations,
    input: {
      actorId: 'owner',
      reviewId: 'review',
      expectedVersion: 3,
      decision: 'REFRESH_BASIS' as const,
      evidence:
        'Service and provider history independently inspected, case ABC-123.',
    },
  };
}
describe('human financial adjudication', () => {
  it('refreshes a stale unapproved case with before/after audit and a new version', async () => {
    const f = fixture();
    await adjudicateFinancialReview(f.tx, f.input);
    expect(f.tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'owner',
          action: 'financial.review-adjudicated',
          before: expect.objectContaining({ version: 3 }),
          after: expect.objectContaining({ version: 4 }),
        }),
      }),
    );
    expect(
      f.tx.$executeRaw.mock.calls.some(([s]: any) =>
        s.join('').includes('version=version+1'),
      ),
    ).toBe(true);
  });
  it.each(['UNKNOWN', 'PENDING', 'FAILED', 'SUCCEEDED'])(
    'never refreshes or releases a %s owner',
    async (state) => {
      const f = fixture();
      f.operations.push({ state });
      await expect(adjudicateFinancialReview(f.tx, f.input)).rejects.toThrow(
        /ownership/,
      );
      expect(f.tx.auditLog.create).not.toHaveBeenCalled();
    },
  );
  it('permits recorded investigation notes while preserving an unknown owner', async () => {
    const f = fixture();
    f.operations.push({ state: 'UNKNOWN' });
    await adjudicateFinancialReview(f.tx, {
      ...f.input,
      decision: 'INVESTIGATE',
    });
    expect(f.tx.auditLog.create).toHaveBeenCalled();
    expect(
      f.tx.$executeRaw.mock.calls.some(([s]: any) =>
        /UPDATE|DELETE/.test(s.join('')),
      ),
    ).toBe(false);
  });
  it('requires an explicit service disposition to refresh a legacy case without a basis', async () => {
    const f = fixture();
    f.review.basis = null;
    await expect(adjudicateFinancialReview(f.tx, f.input)).rejects.toThrow(
      /service disposition/,
    );
    await adjudicateFinancialReview(f.tx, {
      ...f.input,
      basisKind: 'PAYMENT_REFUND',
    });
    expect(f.tx.auditLog.create).toHaveBeenCalled();
  });
  it('rejects stale human decisions', async () => {
    const f = fixture();
    await expect(
      adjudicateFinancialReview(f.tx, { ...f.input, expectedVersion: 2 }),
    ).rejects.toThrow(/changed/);
  });
});
