import { describe, expect, it } from 'vitest';
import { buildClientDirectoryWhere } from '@/lib/admin/client-directory-filters';

describe('ADMIN client directory filters', () => {
  it('limits Somble Transferred to accounts with a Somble profile', () => {
    expect(buildClientDirectoryWhere({ source: 'somble' })).toMatchObject({
      sombleClientProfile: { isNot: null },
    });
  });

  it('limits Native Rhyze to accounts without a Somble profile', () => {
    expect(buildClientDirectoryWhere({ source: 'native' })).toMatchObject({
      sombleClientProfile: { is: null },
    });
  });

  it('limits Instructors by role regardless of transfer source', () => {
    expect(buildClientDirectoryWhere({ source: 'instructors' })).toMatchObject({
      role: 'INSTRUCTOR',
    });
  });

  it('limits Active accounts to claimed member profiles', () => {
    expect(buildClientDirectoryWhere({ account: 'active' })).toMatchObject({
      role: 'MEMBER',
      status: 'ACTIVE',
      passwordHash: { not: null },
    });
  });

  it('limits To Be Claimed accounts to unclaimed Somble member profiles', () => {
    expect(buildClientDirectoryWhere({ account: 'unclaimed' })).toMatchObject({
      role: 'MEMBER',
      passwordHash: null,
      sombleClientProfile: { isNot: null },
    });
  });

  it('limits a selected plan to current memberships for that product', () => {
    expect(buildClientDirectoryWhere({ plan: 'plan-elevate' })).toMatchObject({
      memberships: {
        some: {
          productId: 'plan-elevate',
          status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'] },
        },
      },
    });
  });

  it('treats No native plan as having no current membership', () => {
    expect(buildClientDirectoryWhere({ plan: 'none' })).toMatchObject({
      memberships: {
        none: {
          status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'] },
        },
      },
    });
  });

  it('combines text, source, and membership filters', () => {
    expect(
      buildClientDirectoryWhere({
        q: ' nicole ',
        source: 'instructors',
        plan: 'plan-vip',
      }),
    ).toEqual({
      role: 'INSTRUCTOR',
      NOT: { email: { endsWith: '@rhyze.local' } },
      memberships: {
        some: {
          productId: 'plan-vip',
          status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'] },
        },
      },
      OR: [
        { name: { contains: 'nicole', mode: 'insensitive' } },
        { email: { contains: 'nicole', mode: 'insensitive' } },
      ],
    });
  });
});
