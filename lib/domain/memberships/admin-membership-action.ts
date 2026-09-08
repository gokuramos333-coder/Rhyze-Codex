import type { MembershipStatus } from '@prisma/client';

export type MembershipAdminAction = 'PAUSE' | 'UNPAUSE' | 'CANCEL_AT_PERIOD_END';

export function membershipAdminTransition(
  action: MembershipAdminAction,
  status: MembershipStatus,
) {
  if (action === 'PAUSE') {
    if (status !== 'ACTIVE' && status !== 'TRIALING') {
      throw new Error('Only an active membership can be paused.');
    }
    return {
      stripeUpdate: { pause_collection: { behavior: 'void' as const } },
      localStatus: 'PAUSED' as const,
      cancelAtPeriodEnd: false,
    };
  }
  if (action === 'UNPAUSE') {
    if (status !== 'PAUSED') {
      throw new Error('Only a paused membership can be resumed.');
    }
    return {
      stripeUpdate: { pause_collection: '' as const },
      localStatus: 'ACTIVE' as const,
      cancelAtPeriodEnd: false,
    };
  }
  if (!['ACTIVE', 'TRIALING', 'PAUSED', 'PAST_DUE'].includes(status)) {
    throw new Error('This membership cannot be scheduled for cancellation.');
  }
  return {
    stripeUpdate: { cancel_at_period_end: true },
    localStatus: status,
    cancelAtPeriodEnd: true,
  };
}
