import { describe, expect, it } from 'vitest';
import { membershipAdminTransition } from '@/lib/domain/memberships/admin-membership-action';

describe('owner membership actions', () => {
  it('pauses and unpauses Stripe collection before changing local status', () => {
    expect(membershipAdminTransition('PAUSE', 'ACTIVE')).toEqual({
      stripeUpdate: { pause_collection: { behavior: 'void' } },
      localStatus: 'PAUSED',
      cancelAtPeriodEnd: false,
    });
    expect(membershipAdminTransition('UNPAUSE', 'PAUSED')).toEqual({
      stripeUpdate: { pause_collection: '' },
      localStatus: 'ACTIVE',
      cancelAtPeriodEnd: false,
    });
  });

  it('schedules cancellation without ending paid-period access immediately', () => {
    expect(membershipAdminTransition('CANCEL_AT_PERIOD_END', 'ACTIVE')).toEqual({
      stripeUpdate: { cancel_at_period_end: true },
      localStatus: 'ACTIVE',
      cancelAtPeriodEnd: true,
    });
  });

  it('rejects invalid state transitions', () => {
    expect(() => membershipAdminTransition('PAUSE', 'PAUSED')).toThrow('Only an active membership can be paused.');
    expect(() => membershipAdminTransition('UNPAUSE', 'ACTIVE')).toThrow('Only a paused membership can be resumed.');
    expect(() => membershipAdminTransition('CANCEL_AT_PERIOD_END', 'CANCELLED')).toThrow('This membership cannot be scheduled for cancellation.');
  });
});
