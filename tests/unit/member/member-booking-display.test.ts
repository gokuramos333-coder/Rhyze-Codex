import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { memberBookingDateTimeLabel } from '@/lib/domain/schedule/occurrence-display';

describe('member booking display', () => {
  it('formats member portal booking times in the occurrence timezone used by the public site', () => {
    expect(
      memberBookingDateTimeLabel({
        startAt: new Date('2026-08-05T22:00:00.000Z'),
        timezone: 'America/New_York',
      }),
    ).toBe('Wed, Aug 5, 2026, 6:00 PM');
  });

  it('keeps member booking pages synced to the shared occurrence formatter instead of server-local time', () => {
    const memberHome = readFileSync('app/(portal)/member/page.tsx', 'utf8');
    const memberBookings = readFileSync('app/(portal)/member/bookings/page.tsx', 'utf8');
    const newBooking = readFileSync('app/(portal)/member/bookings/new/page.tsx', 'utf8');

    for (const source of [memberHome, memberBookings, newBooking]) {
      expect(source).toContain('memberBookingDateTimeLabel');
      expect(source).not.toContain('startAt.toLocaleString()');
    }
  });

  it('shows booked classes and events with synced room and duration details in the portal', () => {
    const memberHome = readFileSync('app/(portal)/member/page.tsx', 'utf8');
    const memberBookings = readFileSync('app/(portal)/member/bookings/page.tsx', 'utf8');

    for (const source of [memberHome, memberBookings]) {
      expect(source).toContain('room: true');
      expect(source).toContain('durationMinutes');
      expect(source).toContain('occurrence.room?.name');
    }
    expect(memberBookings).toContain('booking.occurrence.template.isEvent');
  });

  it('makes Classes booked cards jump to booking/class history', () => {
    const memberHome = readFileSync('app/(portal)/member/page.tsx', 'utf8');
    const adminMember = readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');

    expect(memberHome).toContain('Classes booked');
    expect(memberHome).toContain('href="/member/bookings"');
    expect(memberHome).toContain('View bookings →');
    expect(adminMember).toContain('<section id="class-history"');
    expect(adminMember).toContain('href="#class-history"');
    expect(adminMember).toContain('View class history →');
  });

  it('hides expired intro-trial unlimited credits and shows Trial expired in the portal cards', () => {
    const memberHome = readFileSync('app/(portal)/member/page.tsx', 'utf8');
    const memberMembership = readFileSync('app/(portal)/member/membership/page.tsx', 'utf8');

    for (const source of [memberHome, memberMembership]) {
      expect(source).toContain('introTrialIsExpired');
      expect(source).toContain("product.kind === 'INTRO_TRIAL'");
      expect(source).toContain('return false;');
      expect(source).toContain('Trial expired');
    }
  });
});
