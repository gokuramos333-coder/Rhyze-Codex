import type { Prisma } from '@prisma/client';
import { isApprovedOwnerEmail } from '@/lib/auth/owner-access';

type ClientStatusInput = {
  email: string;
  role: string;
  accountStatus: string;
  sombleStatus?: string | null;
  bookingCount: number;
  hasActiveMembership: boolean;
  hasClaimedAccount: boolean;
  isSombleTransferred: boolean;
};

export function adminClientStatus(input: ClientStatusInput) {
  if (isApprovedOwnerEmail(input.email)) return 'ADMIN';

  if (!['ACTIVE', 'INVITED'].includes(input.accountStatus)) {
    return input.accountStatus;
  }

  if (input.role === 'INSTRUCTOR') return 'INSTRUCTOR';
  if (input.hasClaimedAccount) return 'ACTIVE';
  if (input.isSombleTransferred) return 'TO BE CLAIMED';

  return input.sombleStatus || input.accountStatus;
}

export function claimedAccountStatusUpdateWhere(): Prisma.UserWhereInput {
  return {
    role: { in: ['MEMBER', 'INSTRUCTOR'] },
    status: 'INVITED',
    passwordHash: { not: null },
  };
}
