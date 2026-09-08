import type { MembershipStatus, Prisma, ProductKind } from '@prisma/client';

export const qualifyingActiveMembershipStatuses = [
  'ACTIVE',
  'TRIALING',
] satisfies MembershipStatus[];

export const qualifyingMembershipProductKinds = [
  'MONTHLY_UNLIMITED',
  'LIMITED_MEMBERSHIP',
  'VIP',
] satisfies ProductKind[];

export const qualifyingMembershipWhere = {
  status: { in: qualifyingActiveMembershipStatuses },
  product: { kind: { in: qualifyingMembershipProductKinds } },
} satisfies Prisma.MembershipWhereInput;

export const activeMembershipUserWhere = {
  NOT: { email: { endsWith: '@rhyze.local' } },
  memberships: { some: qualifyingMembershipWhere },
} satisfies Prisma.UserWhereInput;

export function isQualifyingActiveMembership(input: {
  status: MembershipStatus;
  productKind: ProductKind;
}) {
  return (
    qualifyingActiveMembershipStatuses.some((status) => status === input.status) &&
    qualifyingMembershipProductKinds.some((kind) => kind === input.productKind)
  );
}
