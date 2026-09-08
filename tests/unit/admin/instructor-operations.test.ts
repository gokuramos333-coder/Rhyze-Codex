import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { instructorStatusTransition } from '@/lib/domain/instructors/instructor-status';
import { canAccessArea } from '@/lib/auth/authorization';
import { instructorAugustStandardClassAccess } from '@/lib/domain/bookings/booking-rules';

describe('instructor operations', () => {
  it('revokes and restores all instructor-facing access consistently', () => {
    expect(instructorStatusTransition('REVOKE')).toEqual({
      role: 'MEMBER',
      profileActive: false,
      applicationStatus: 'REJECTED',
      referralActive: false,
    });
    expect(instructorStatusTransition('APPROVE')).toEqual({
      role: 'INSTRUCTOR',
      profileActive: true,
      applicationStatus: 'APPROVED',
      referralActive: true,
    });
  });

  it('keeps a revoked instructor as a paying member without instructor or complimentary access', () => {
    const revoked = instructorStatusTransition('REVOKE');

    expect(revoked.role).toBe('MEMBER');
    expect(revoked.profileActive).toBe(false);
    expect(canAccessArea(revoked.role, 'member')).toBe(true);
    expect(canAccessArea(revoked.role, 'instructor')).toBe(false);
    expect(instructorAugustStandardClassAccess({
      role: revoked.role,
      occurrenceStartsAt: new Date('2026-08-15T14:00:00.000Z'),
      isEvent: false,
    })).toBe(false);
  });

  it('uses the full revocation transition when an instructor is removed from the directory', () => {
    const actions = readFileSync('app/(studio)/admin/instructors/actions.ts', 'utf8');
    const removeAction = actions.slice(
      actions.indexOf('export async function removeInstructorAction'),
      actions.indexOf('export async function saveInstructorOrderAction'),
    );

    expect(removeAction).toContain("instructorStatusTransition('REVOKE')");
    expect(removeAction).toContain('prisma.$transaction');
    expect(removeAction).toContain('referralCode.updateMany');
    expect(removeAction).toContain("action: 'instructor.removed'");
  });

  it('replaces waiver and booked-value cards with status and pay rates', () => {
    const admin = readFileSync('app/(studio)/admin/instructors/[userId]/page.tsx', 'utf8');
    const instructor = readFileSync('app/(portal)/instructor/profile/page.tsx', 'utf8');

    expect(admin).not.toContain('BOOKED CLASS VALUE');
    expect(admin).not.toContain('Current studio waiver');
    expect(admin).toContain('Instructor status');
    expect(admin).toContain('Standard class pay rate');
    expect(admin).toContain('Specialty event pay rate');
    expect(admin).toContain('<Metric label="Specialty event pay rate"');
    expect(instructor).toContain('Standard Classes');
    expect(instructor).toContain('Specialty Events');
  });

  it('does not show per-offering direct revenue estimates on class or event cards', () => {
    const classes = readFileSync('app/(studio)/admin/classes/page.tsx', 'utf8');
    const events = readFileSync('app/(studio)/admin/events/page.tsx', 'utf8');

    expect(classes).not.toContain('Direct tracked revenue');
    expect(events).not.toContain('Direct tracked revenue');
    expect(classes).not.toContain('directRevenueByTemplate');
    expect(events).not.toContain('directRevenueByTemplate');
  });

  it('shows Tricia Johnsen her class revenue for 50/50 split visibility', () => {
    const schedule = readFileSync('app/(portal)/instructor/schedule/page.tsx', 'utf8');

    expect(schedule).toContain('isTriciaJohnsen');
    expect(schedule).toContain('Class revenue');
    expect(schedule).toContain('text-emerald-700');
  });

  it('shows instructors when assigned classes are canceled instead of leaving the class looking active', () => {
    const schedule = readFileSync('app/(portal)/instructor/schedule/page.tsx', 'utf8');
    const roster = readFileSync('app/(portal)/instructor/classes/[occurrenceId]/roster/page.tsx', 'utf8');
    const message = readFileSync('app/(portal)/instructor/classes/[occurrenceId]/message/page.tsx', 'utf8');

    expect(schedule).toContain("status: { in: ['SCHEDULED', 'CANCELLED'] }");
    expect(schedule).toContain('CLASS CANCELED');
    expect(schedule).toContain('This class is canceled');
    expect(roster).toContain('CLASS CANCELED');
    expect(message).toContain('This class is already canceled');
  });

  it('requires instructor emergency cancellations to use the approved reason options before emails are sent', () => {
    const message = readFileSync('app/(portal)/instructor/classes/[occurrenceId]/message/page.tsx', 'utf8');
    const actions = readFileSync('app/(portal)/instructor/classes/[occurrenceId]/message/actions.ts', 'utf8');

    expect(message).toContain('Before emails are sent');
    expect(message).toContain('name="cancellationReasonType"');
    expect(message).toContain('Weather related');
    expect(message).toContain('Instructor emergency');
    expect(message).toContain('General apology');
    expect(message).toContain('name="customCancellationReason"');
    expect(actions).toContain('resolveCancellationReason');
    expect(actions).toContain('customCancellationReason');
    expect(actions).toContain("template: 'CLASS_CANCELLED'");
  });

  it('shows only selected referral range controls and detailed referrals', () => {
    const admin = readFileSync('app/(studio)/admin/instructors/[userId]/page.tsx', 'utf8');
    const instructor = readFileSync('app/(portal)/instructor/referrals/page.tsx', 'utf8');

    for (const source of [admin, instructor]) {
      expect(source).toContain('Bi-weekly');
      expect(source).toContain('From date');
      expect(source).toContain('To date');
      expect(source).not.toContain("'lifetime'");
      expect(source).not.toContain("'year'");
    }
  });

  it('keeps referral commissions linked to the instructor and separates unpaid from paid earnings', () => {
    const checkout = readFileSync('app/(portal)/member/membership/actions.ts', 'utf8');
    const webhook = readFileSync('lib/payments/webhook-processor.ts', 'utf8');
    const admin = readFileSync('app/(studio)/admin/instructors/[userId]/page.tsx', 'utf8');
    const instructor = readFileSync('app/(portal)/instructor/referrals/page.tsx', 'utf8');

    expect(checkout).toContain('referralAttribution.upsert');
    expect(checkout).toContain('referralCodeId: referral.id');
    expect(webhook).toContain('instructorId: attribution.referralCode.instructorId');
    expect(webhook).toContain('referredUserId: purchase.userId');
    expect(webhook).toContain('purchaseId: purchase.id');

    for (const source of [admin, instructor]) {
      expect(source).toContain("item.status === 'EARNED'");
      expect(source).toContain("item.status === 'PAID'");
      expect(source).toContain('Available for payout');
      expect(source).toContain('Paid');
    }
  });
});
