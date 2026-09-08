import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildAdminActivityItems,
  clientDirectoryBookedClassCount,
  clientDirectoryJoinedAt,
  clientDirectoryLastLoginAt,
  clientDirectoryWorkoutCount,
} from '@/lib/admin/activity-client-metrics';
import { defaultInstructorPayForOccurrence, instructorPayLabel, parseDollarCents } from '@/lib/domain/instructors/pay-rates';

describe('admin activity feed and client metrics', () => {
  it('includes native signups, purchases, memberships, commerce orders, Somble joins, and Somble transactions ordered newest first', () => {
    const user = { id: 'u1', name: 'Native Member', email: 'native@example.com', createdAt: new Date('2026-07-01T12:00:00Z') };

    const items = buildAdminActivityItems({
      users: [user],
      purchases: [{ id: 'p1', user, product: { name: '10 Class Pack', billingInterval: 'ONE_TIME', kind: 'CLASS_PACK' }, amountCents: 25000, refundedAmountCents: 0, status: 'PAID', paidAt: new Date('2026-07-03T12:00:00Z'), createdAt: new Date('2026-07-02T12:00:00Z'), refunds: [] }],
      memberships: [{ id: 'm1', user, product: { name: 'Unlimited' }, status: 'ACTIVE', createdAt: new Date('2026-07-04T12:00:00Z'), currentPeriodStart: new Date('2026-07-04T12:00:00Z') }],
      commerceOrders: [{ id: 'o1', user, customerEmail: null, kind: 'EVENT', amountCents: 4000, status: 'PAID', paidAt: new Date('2026-07-05T12:00:00Z'), createdAt: new Date('2026-07-05T11:00:00Z'), items: [{ name: 'Event Ticket', quantity: 1 }] }],
      sombleProfiles: [{ id: 's1', user, sourceJoinedAt: new Date('2026-07-02T12:00:00Z'), sourceStatus: 'Active' }],
      sombleTransactions: [{ id: 't1', user, supporterName: 'Native Member', contentType: 'Drop-in', amountCents: 1800, transferredAt: new Date('2026-07-06T12:00:00Z') }],
      paymentRecords: [{ id: 'pay1', user, kind: 'PRODUCT_PURCHASE', status: 'SUCCEEDED', amountCents: 3000, refundedAmountCents: 0, occurredAt: new Date('2026-07-07T12:00:00Z'), purchaseId: null, commerceOrderId: null }],
    });

    expect(items.map((item) => item.id)).toEqual(['stripe-payment-pay1', 'somble-sale-t1', 'commerce-order-o1', 'membership-m1', 'purchase-p1', 'somble-join-s1', 'signup-u1']);
    expect(items.map((item) => item.detail)).toEqual([
      'Direct Stripe payment · Product purchase · $30.00 succeeded',
      'Drop-in · $18.00 transferred from Somble',
      'Event purchase · Event Ticket · $40.00 paid',
      'Membership joined · Unlimited · ACTIVE',
      '10 Class Pack · $250.00 paid',
      'Joined through Somble · Active',
      'New Rhyze account created',
    ]);
  });

  it('shows refunds in Activity on the refund date with the net purchase impact clear', () => {
    const user = { id: 'u1', name: 'Native Member', email: 'native@example.com', createdAt: new Date('2026-07-01T12:00:00Z') };

    const items = buildAdminActivityItems({
      users: [],
      purchases: [{
        id: 'p1',
        user,
        product: { name: 'Elevate' },
        amountCents: 9200,
        refundedAmountCents: 9200,
        status: 'REFUNDED',
        paidAt: new Date('2026-07-03T12:00:00Z'),
        createdAt: new Date('2026-07-03T12:00:00Z'),
        refunds: [{ id: 'r1', amountCents: 9200, createdAt: new Date('2026-07-08T12:00:00Z') }],
      }],
      memberships: [],
      commerceOrders: [],
      sombleProfiles: [],
      sombleTransactions: [],
    });

    expect(items.map((item) => item.id)).toEqual(['refund-r1', 'purchase-p1']);
    expect(items[0]).toMatchObject({
      at: new Date('2026-07-08T12:00:00Z'),
      name: 'Native Member',
      detail: 'Refund issued · Elevate · $92.00 returned',
      href: '/admin/members/u1',
    });
    expect(items[1].detail).toBe('Elevate · $92.00 refunded · net $0.00');
  });

  it('shows the captured Stripe customer name when a direct payment is not linked to a user yet', () => {
    const items = buildAdminActivityItems({
      users: [],
      purchases: [],
      memberships: [],
      commerceOrders: [],
      sombleProfiles: [],
      sombleTransactions: [],
      paymentRecords: [{
        id: 'pay-guest',
        user: null,
        customerName: 'Rachel McGowan',
        customerEmail: 'mcgowanrachel14@gmail.com',
        kind: 'PRODUCT_PURCHASE',
        status: 'SUCCEEDED',
        amountCents: 3000,
        refundedAmountCents: 0,
        occurredAt: new Date('2026-07-31T18:24:55Z'),
        purchaseId: null,
        commerceOrderId: null,
      }],
    });

    expect(items[0].name).toBe('Rachel McGowan');
  });

  it('counts only active or happened class bookings, not cancelled bookings', () => {
    expect(
      clientDirectoryBookedClassCount({
        bookings: [
          { status: 'CONFIRMED', occurrence: { status: 'SCHEDULED' } },
          { status: 'ATTENDED', occurrence: { status: 'COMPLETED' } },
          { status: 'NO_SHOW', occurrence: { status: 'COMPLETED' } },
          { status: 'CANCELLED', occurrence: { status: 'SCHEDULED' } },
          { status: 'LATE_CANCELLED', occurrence: { status: 'COMPLETED' } },
          { status: 'CONFIRMED', occurrence: { status: 'CANCELLED' } },
        ],
      }),
    ).toBe(3);
  });

  it('uses native profile data when Somble-only fields are missing', () => {
    const createdAt = new Date('2026-07-10T12:00:00Z');
    const lastLoginAt = new Date('2026-07-12T12:00:00Z');
    const attendedAt = new Date('2026-07-13T12:00:00Z');

    const member = {
      createdAt,
      lastLoginAt,
      sombleClientProfile: null,
      attendanceRecords: [{ status: 'ATTENDED', checkedInAt: attendedAt }],
      _count: { bookings: 3 },
    };

    expect(clientDirectoryJoinedAt(member)).toEqual(createdAt);
    expect(clientDirectoryLastLoginAt(member)).toEqual(lastLoginAt);
    expect(clientDirectoryWorkoutCount(member)).toBe(1);
  });

  it('combines Somble imported totals with native attendance records', () => {
    const member = {
      createdAt: new Date('2026-07-10T12:00:00Z'),
      lastLoginAt: null,
      sombleClientProfile: {
        sourceJoinedAt: new Date('2026-05-01T12:00:00Z'),
        lastLoginAt: new Date('2026-05-02T12:00:00Z'),
        totalWorkouts: 8,
      },
      attendanceRecords: [
        { status: 'ATTENDED', checkedInAt: new Date('2026-07-13T12:00:00Z') },
        { status: 'CHECKED_IN', checkedInAt: new Date('2026-07-14T12:00:00Z') },
        { status: 'NO_SHOW', checkedInAt: null },
      ],
      _count: { bookings: 3 },
    };

    expect(clientDirectoryJoinedAt(member)).toEqual(member.sombleClientProfile.sourceJoinedAt);
    expect(clientDirectoryLastLoginAt(member)).toEqual(member.lastLoginAt ?? member.sombleClientProfile.lastLoginAt);
    expect(clientDirectoryWorkoutCount(member)).toBe(10);
  });

  it('shows booking, cancellation, waitlist, promotion, attendance, and no-show activity rows', () => {
    const user = { id: 'u1', name: 'Native Member', email: 'native@example.com', createdAt: new Date('2026-07-01T12:00:00Z') };
    const occurrence = {
      id: 'occ1',
      startAt: new Date('2026-08-01T14:00:00Z'),
      template: { name: 'Rhyze Flow', isEvent: false },
    };
    const eventOccurrence = {
      id: 'event1',
      startAt: new Date('2026-08-02T14:00:00Z'),
      template: { name: 'Full Moon Rhyze', isEvent: true },
    };

    const items = buildAdminActivityItems({
      users: [],
      purchases: [],
      memberships: [],
      commerceOrders: [],
      sombleProfiles: [],
      sombleTransactions: [],
      bookings: [
        { id: 'b1', user, status: 'CONFIRMED', source: 'MEMBER', bookedAt: new Date('2026-07-10T12:00:00Z'), cancelledAt: null, occurrence },
        { id: 'b2', user, status: 'LATE_CANCELLED', source: 'MEMBER', bookedAt: new Date('2026-07-11T12:00:00Z'), cancelledAt: new Date('2026-07-12T12:00:00Z'), occurrence: eventOccurrence },
      ],
      waitlistEntries: [
        { id: 'w1', user, status: 'PROMOTED', joinedAt: new Date('2026-07-13T12:00:00Z'), promotedAt: new Date('2026-07-14T12:00:00Z'), leftAt: null, occurrence },
        { id: 'w2', user, status: 'LEFT', joinedAt: new Date('2026-07-15T12:00:00Z'), promotedAt: null, leftAt: new Date('2026-07-16T12:00:00Z'), occurrence },
      ],
      attendanceRecords: [
        { id: 'a1', user, status: 'ATTENDED', checkedInAt: new Date('2026-07-17T12:00:00Z'), createdAt: new Date('2026-07-17T11:00:00Z'), occurrence },
        { id: 'a2', user, status: 'NO_SHOW', checkedInAt: null, createdAt: new Date('2026-07-18T12:00:00Z'), occurrence },
      ],
    });

    expect(items.map((item) => item.detail)).toEqual([
      'No-show marked · Rhyze Flow',
      'Attendance marked · Rhyze Flow',
      'Waitlist left · Rhyze Flow',
      'Waitlist joined · Rhyze Flow',
      'Class booked from waitlist · Rhyze Flow',
      'Waitlist joined · Rhyze Flow',
      'Event late-cancelled · Full Moon Rhyze',
      'Event booked · Full Moon Rhyze',
      'Class booked · Rhyze Flow',
    ]);
    expect(items.every((item) => item.href.startsWith('/admin/schedule/'))).toBe(true);
  });

  it('keeps instructor pay defaults tied to class type and supports per-class custom amounts', () => {
    expect(defaultInstructorPayForOccurrence({ isEvent: false, standardClassRateCents: 4500, specialtyEventRateCents: 9000 })).toEqual({
      method: 'STANDARD_CLASS_RATE',
      cents: 4500,
    });
    expect(defaultInstructorPayForOccurrence({ isEvent: true, standardClassRateCents: 4500, specialtyEventRateCents: 9000 })).toEqual({
      method: 'SPECIALTY_EVENT_RATE',
      cents: 9000,
    });
    expect(defaultInstructorPayForOccurrence({ isEvent: false })).toEqual({ method: 'STANDARD_CLASS_RATE', cents: 4000 });
    expect(parseDollarCents('$42.50')).toBe(4250);
    expect(instructorPayLabel('CUSTOM_RATE')).toBe('Custom class rate');
  });

  it('keeps Overview activity/sales/refund panels wired to live native records', () => {
    const source = readFileSync('app/(studio)/admin/page.tsx', 'utf8');

    expect(source).toContain('activityBookings');
    expect(source).toContain('activityWaitlistEntries');
    expect(source).toContain('activityAttendanceRecords');
    expect(source).toContain('activityPaymentRecords');
    expect(source).toContain('syncRecentStripePaymentRecords');
    expect(source).toContain('excludeSombleBackedStripePaymentRecords');
    expect(source).toContain('visiblePaymentRecords');
    expect(source).toContain('directRevenuePaymentRecords');
    expect(source).toContain('directRevenuePaymentRecords = unlinkedPaymentRecords.filter((record) => record.userId)');
    expect(source).toContain('Verified direct Stripe');
    expect(readFileSync('netlify/functions/stripe-sync.ts', 'utf8')).toContain("schedule: '* * * * *'");
    expect(readFileSync('netlify/functions/stripe-sync.ts', 'utf8')).toContain("runProtectedJob('/api/jobs/stripe-sync')");
    expect(source).toContain('paymentRecords: visiblePaymentRecords');
    expect(source).toContain('bookings: activityBookings');
    expect(source).toContain('waitlistEntries: activityWaitlistEntries');
    expect(source).toContain('attendanceRecords: activityAttendanceRecords');
    expect(source).toContain('SYNCED SALES LEDGER');
    expect(source).toContain('Total revenue');
    expect(source).toContain('Somble transferred revenue + verified Rhyze Stripe purchases - refunds');
    expect(source).toContain("status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] }");
    expect(source).toContain('directStripeGrossRevenueCents');
    expect(source).toContain('directStripeRefundedRevenueCents');
    const paymentsSource = readFileSync('app/(studio)/admin/payments/page.tsx', 'utf8');
    expect(paymentsSource).toContain('excludeSombleBackedStripePaymentRecords(paymentRecords, historical)');
    expect(paymentsSource).toContain('verifiedPaymentRecords');
    expect(paymentsSource).toContain('unmatchedPaymentRecords');
    expect(paymentsSource).toContain('Unmatched Stripe review');
    expect(readFileSync('lib/payments/stripe-payment-sync.ts', 'utf8')).toContain('skippedSombleBacked');
    expect(readFileSync('lib/payments/stripe-payment-sync.ts', 'utf8')).toContain('sombleTransaction.findMany');
    expect(source).toContain('user: { select: { name: true, email: true } }');
    expect(source).toContain('{item.user.name || item.user.email}');
    expect(source).toContain('id="refunds"');
    expect(source).toContain('Refund records');
  });

  it('uses the regular site font for attendee names instead of the condensed heading font', () => {
    const roster = readFileSync('components/attendance/Roster.tsx', 'utf8');

    expect(roster).toContain('className="font-sans text-lg font-black"');
  });

  it('shows exact money in Overview charts instead of rounded compact revenue', () => {
    const source = readFileSync('components/admin/AnalyticsCharts.tsx', 'utf8');

    expect(source).toContain('function exactMoney');
    expect(source).toContain('minimumFractionDigits: 2');
    expect(source).not.toContain('notation: cents >= 100000');
    expect(source).not.toContain('compactMoney');
  });

  it('keeps admin and instructor booking surfaces force-dynamic for live roster/activity data', () => {
    for (const path of [
      'app/(studio)/admin/page.tsx',
      'app/(studio)/admin/payments/page.tsx',
      'app/api/jobs/stripe-sync/route.ts',
      'app/(portal)/instructor/schedule/page.tsx',
      'app/(portal)/instructor/classes/[occurrenceId]/roster/page.tsx',
      'app/checkout/success/page.tsx',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain("export const dynamic = 'force-dynamic'");
      expect(source).toContain('export const revalidate = 0');
    }
    for (const path of [
      'app/(studio)/admin/page.tsx',
      'app/(portal)/instructor/schedule/page.tsx',
      'app/(portal)/instructor/classes/[occurrenceId]/roster/page.tsx',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('LiveDataRefresh');
    }
  });
});
