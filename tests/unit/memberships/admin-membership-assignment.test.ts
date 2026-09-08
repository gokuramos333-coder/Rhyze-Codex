import { describe, expect, it } from 'vitest';
import {
  assignedMembershipRecords,
  parseAdminMembershipAssignmentInput,
} from '@/lib/domain/memberships/admin-membership-assignment';

describe('admin no-charge membership assignment', () => {
  it('requires a future end date and an admin reason', () => {
    expect(() => parseAdminMembershipAssignmentInput({
      productId: 'vip', accessEndDate: '2026-09-07', reason: 'Walk-in grant',
    }, new Date('2026-09-08T14:00:00.000Z'))).toThrow('future');

    expect(() => parseAdminMembershipAssignmentInput({
      productId: 'vip', accessEndDate: '2026-10-08', reason: '',
    }, new Date('2026-09-08T14:00:00.000Z'))).toThrow();
  });

  it('builds a zero-dollar purchase-backed finite membership and grant', () => {
    const now = new Date('2026-09-08T14:00:00.000Z');
    const end = new Date('2026-10-09T03:59:59.999Z');
    expect(assignedMembershipRecords({
      actorId: 'owner', userId: 'member', now, end,
      reason: 'Walk-in courtesy',
      product: { id: 'ritual', name: 'Ritual', includedCredits: 8, isUnlimited: false },
    })).toEqual(expect.objectContaining({
      purchase: expect.objectContaining({ amountCents: 0, status: 'PAID', paidAt: now }),
      membership: expect.objectContaining({ status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: end }),
      creditAccount: expect.objectContaining({ isUnlimited: false, validFrom: now, validUntil: end }),
      grant: expect.objectContaining({ type: 'GRANT', quantity: 8 }),
    }));
  });

  it('builds unlimited assigned access without a finite grant entry', () => {
    const records = assignedMembershipRecords({
      actorId: 'owner', userId: 'member', now: new Date('2026-09-08T14:00:00.000Z'),
      end: new Date('2026-10-09T03:59:59.999Z'), reason: 'VIP grant',
      product: { id: 'vip', name: 'VIP', includedCredits: null, isUnlimited: true },
    });
    expect(records.creditAccount.isUnlimited).toBe(true);
    expect(records.grant).toBeNull();
  });
});
