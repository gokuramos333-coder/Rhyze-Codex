import { describe, expect, it } from 'vitest';
import {
  activeMembershipUserWhere,
  isQualifyingActiveMembership,
  qualifyingMembershipWhere,
} from '@/lib/domain/memberships/active-membership';

describe('active membership definition', () => {
  it.each([
    ['ACTIVE', 'MONTHLY_UNLIMITED'],
    ['TRIALING', 'LIMITED_MEMBERSHIP'],
    ['ACTIVE', 'VIP'],
  ] as const)('includes %s %s memberships', (status, kind) => {
    expect(isQualifyingActiveMembership({ status, productKind: kind })).toBe(true);
  });

  it.each([
    ['ACTIVE', 'INTRO_TRIAL'],
    ['ACTIVE', 'CLASS_PACK'],
    ['ACTIVE', 'DROP_IN'],
    ['PAUSED', 'VIP'],
    ['PAST_DUE', 'LIMITED_MEMBERSHIP'],
    ['CANCELLED', 'MONTHLY_UNLIMITED'],
    ['EXPIRED', 'VIP'],
  ] as const)('excludes %s %s memberships', (status, kind) => {
    expect(isQualifyingActiveMembership({ status, productKind: kind })).toBe(false);
  });

  it('provides one Prisma membership predicate for dashboard and directory queries', () => {
    expect(qualifyingMembershipWhere).toEqual({
      status: { in: ['ACTIVE', 'TRIALING'] },
      product: {
        kind: { in: ['MONTHLY_UNLIMITED', 'LIMITED_MEMBERSHIP', 'VIP'] },
      },
    });
    expect(activeMembershipUserWhere).toEqual({
      NOT: { email: { endsWith: '@rhyze.local' } },
      memberships: { some: qualifyingMembershipWhere },
    });
  });
});
