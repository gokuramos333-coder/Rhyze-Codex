import { describe, expect, it } from 'vitest';
import {
  adminClientStatus,
  claimedAccountStatusUpdateWhere,
} from '@/lib/admin/client-status';

describe('admin client status', () => {
  it('labels the three approved owner accounts as admin', () => {
    expect(
      adminClientStatus({
        email: 'gui@westaffnj.com',
        role: 'OWNER',
        accountStatus: 'ACTIVE',
        bookingCount: 0,
        hasActiveMembership: false,
        hasClaimedAccount: true,
        isSombleTransferred: false,
      }),
    ).toBe('ADMIN');
  });

  it('shows invited clients who have not claimed their account as to be claimed even when booked', () => {
    expect(
      adminClientStatus({
        email: 'member@example.com',
        role: 'MEMBER',
        accountStatus: 'INVITED',
        sombleStatus: 'inactive',
        bookingCount: 1,
        hasActiveMembership: false,
        hasClaimedAccount: false,
        isSombleTransferred: true,
      }),
    ).toBe('TO BE CLAIMED');
  });

  it('shows active only after the client has claimed their account', () => {
    expect(
      adminClientStatus({
        email: 'member@example.com',
        role: 'MEMBER',
        accountStatus: 'ACTIVE',
        bookingCount: 0,
        hasActiveMembership: false,
        hasClaimedAccount: true,
        isSombleTransferred: true,
      }),
    ).toBe('ACTIVE');
  });

  it('treats claimed invited imports as active so stale imported statuses do not stay to be claimed', () => {
    expect(
      adminClientStatus({
        email: 'member@example.com',
        role: 'MEMBER',
        accountStatus: 'INVITED',
        bookingCount: 0,
        hasActiveMembership: false,
        hasClaimedAccount: true,
        isSombleTransferred: true,
      }),
    ).toBe('ACTIVE');
  });

  it('keeps a native account active even when it does not use a local password', () => {
    expect(
      adminClientStatus({
        email: 'native@example.com',
        role: 'MEMBER',
        accountStatus: 'ACTIVE',
        bookingCount: 0,
        hasActiveMembership: false,
        hasClaimedAccount: false,
        isSombleTransferred: false,
      }),
    ).toBe('ACTIVE');
  });

  it('labels instructor accounts as instructor', () => {
    expect(
      adminClientStatus({
        email: 'coach@example.com',
        role: 'INSTRUCTOR',
        accountStatus: 'ACTIVE',
        bookingCount: 0,
        hasActiveMembership: false,
        hasClaimedAccount: true,
        isSombleTransferred: false,
      }),
    ).toBe('INSTRUCTOR');
  });

  it('does not relabel suspended accounts as active', () => {
    expect(
      adminClientStatus({
        email: 'suspended@example.com',
        role: 'MEMBER',
        accountStatus: 'SUSPENDED',
        bookingCount: 0,
        hasActiveMembership: false,
        hasClaimedAccount: true,
        isSombleTransferred: false,
      }),
    ).toBe('SUSPENDED');
  });

  it('only repairs claimed invited member and instructor accounts', () => {
    expect(claimedAccountStatusUpdateWhere()).toEqual({
      role: { in: ['MEMBER', 'INSTRUCTOR'] },
      status: 'INVITED',
      passwordHash: { not: null },
    });
  });
});
