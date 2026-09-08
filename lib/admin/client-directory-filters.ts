import type { MembershipStatus, Prisma } from '@prisma/client';

export const currentMembershipStatuses: MembershipStatus[] = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'PAUSED',
];

export type ClientDirectorySource = 'somble' | 'native' | 'instructors';

type ClientDirectoryFilters = {
  q?: string;
  source?: string;
  plan?: string;
  account?: string;
};

export function buildClientDirectoryWhere({
  q,
  source,
  plan,
  account,
}: ClientDirectoryFilters): Prisma.UserWhereInput {
  const query = q?.trim();
  const where: Prisma.UserWhereInput = {
    role:
      source === 'instructors'
        ? 'INSTRUCTOR'
        : { in: ['MEMBER', 'INSTRUCTOR', 'MANAGER', 'ADMIN', 'OWNER'] },
    NOT: { email: { endsWith: '@rhyze.local' } },
  };

  if (source === 'somble') {
    where.sombleClientProfile = { isNot: null };
  } else if (source === 'native') {
    where.sombleClientProfile = { is: null };
  }

  if (account === 'active') {
    where.role = 'MEMBER';
    where.status = 'ACTIVE';
    where.passwordHash = { not: null };
  } else if (account === 'unclaimed') {
    where.role = 'MEMBER';
    where.passwordHash = null;
    where.sombleClientProfile = { isNot: null };
  }

  if (plan === 'none') {
    where.memberships = {
      none: { status: { in: currentMembershipStatuses } },
    };
  } else if (plan) {
    where.memberships = {
      some: {
        productId: plan,
        status: { in: currentMembershipStatuses },
      },
    };
  }

  if (query) {
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },
    ];
  }

  return where;
}
