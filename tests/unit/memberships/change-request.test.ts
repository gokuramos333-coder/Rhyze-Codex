import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cancellationNoticeStatus,
  parseMembershipChangeRequest,
} from '@/lib/domain/memberships/change-request';

describe('membership change request', () => {
  it('accepts cancellation without a replacement product', () => {
    expect(
      parseMembershipChangeRequest({
        membershipId: 'membership-1',
        type: 'CANCEL',
        requestedProductId: '',
        memberNote: 'Please cancel after this billing period.',
      }),
    ).toEqual({
      membershipId: 'membership-1',
      type: 'CANCEL',
      requestedProductId: null,
      memberNote: 'Please cancel after this billing period.',
    });
  });

  it('requires a replacement product when changing plans', () => {
    expect(() =>
      parseMembershipChangeRequest({
        membershipId: 'membership-1',
        type: 'CHANGE',
        requestedProductId: '',
        memberNote: '',
      }),
    ).toThrow('Select the plan you want to change to.');
  });

  it('requires members to give management a cancellation reason', () => {
    expect(() =>
      parseMembershipChangeRequest({
        membershipId: 'membership-1',
        type: 'CANCEL',
        requestedProductId: '',
        memberNote: '   ',
      }),
    ).toThrow('Tell management why you are cancelling.');
  });

  it('calculates whether the request meets the 14-day notice policy', () => {
    const requestedAt = new Date('2026-08-01T12:00:00.000Z');

    expect(
      cancellationNoticeStatus(
        new Date('2026-08-15T12:00:00.000Z'),
        requestedAt,
      ),
    ).toEqual({ meetsNotice: true, daysBeforeRenewal: 14 });
    expect(
      cancellationNoticeStatus(
        new Date('2026-08-10T12:00:00.000Z'),
        requestedAt,
      ),
    ).toEqual({ meetsNotice: false, daysBeforeRenewal: 9 });
  });

  it('rejects unsupported actions and oversized notes', () => {
    expect(() =>
      parseMembershipChangeRequest({
        membershipId: 'membership-1',
        type: 'PAUSE',
        requestedProductId: '',
        memberNote: '',
      }),
    ).toThrow('Choose change or cancel.');
    expect(() =>
      parseMembershipChangeRequest({
        membershipId: 'membership-1',
        type: 'CANCEL',
        requestedProductId: '',
        memberNote: 'x'.repeat(1001),
      }),
    ).toThrow('Keep your note under 1,000 characters.');
  });

  it('uses management-neutral review copy in the member portal', () => {
    const page = readFileSync('app/(portal)/member/membership/page.tsx', 'utf8');
    const form = readFileSync('components/memberships/MembershipChangeRequestForm.tsx', 'utf8');
    expect(page).toContain('until management reviews it.');
    expect(page).not.toContain('until Vanessa or Melissa reviews it.');
    expect(page).not.toContain('Vanessa or Melissa must review the request.');
    expect(form).toContain('at least 14 days before your next billing date');
    expect(form).toContain('Cancellation reason');
  });
});
