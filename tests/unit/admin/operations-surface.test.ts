import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin and instructor operational surfaces', () => {
  it('makes sales summary cards drill into named ledgers', () => {
    const page = readFileSync('app/(studio)/admin/payments/page.tsx', 'utf8');
    expect(page).toContain('href="#native-collected"');
    expect(page).toContain('href="#native-refunds"');
    expect(page).toContain('href="#native-payment-records"');
  });

  it('uses the requested roster controls and no duplicate attended control', () => {
    const roster = readFileSync('components/attendance/Roster.tsx', 'utf8');
    expect(roster).toContain("['CHECKED_IN', 'NO_SHOW', 'LATE_CANCELLED']");
    expect(roster).not.toContain("['CHECKED_IN', 'ATTENDED'");
    expect(roster).toContain('Undo ${label.toLowerCase()}');
  });

  it('shows the member booking timestamp everywhere attendees/rosters are reviewed', () => {
    const roster = readFileSync('components/attendance/Roster.tsx', 'utf8');
    const adminRoster = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/roster/page.tsx', 'utf8');
    const instructorRoster = readFileSync('app/(portal)/instructor/classes/[occurrenceId]/roster/page.tsx', 'utf8');
    const memberProfile = readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');
    const memberBookings = readFileSync('app/(portal)/member/bookings/page.tsx', 'utf8');

    expect(roster).toContain('bookedAt: Date');
    expect(roster).toContain('Booked');
    expect(roster).toContain('bookingBookedAtLabel(booking.bookedAt)');
    expect(adminRoster).toContain("orderBy: { bookedAt: 'desc' }");
    expect(instructorRoster).toContain("orderBy: { bookedAt: 'desc' }");
    expect(memberProfile).toContain('Booked at');
    expect(memberBookings).toContain('Booked at');
  });

  it('offers class-attendee campaigns and immediate sending', () => {
    const page = readFileSync('app/(studio)/admin/campaigns/page.tsx', 'utf8');
    expect(page).toContain('Attendees for one class');
    expect(page).toContain('Send now');
  });

  it('shows the freeze sales promise across membership conversion surfaces', () => {
    const promo = readFileSync('components/sections/MembershipFreedomStrip.tsx', 'utf8');
    const homePage = readFileSync('app/page.tsx', 'utf8');
    const joinPage = readFileSync('app/join/page.tsx', 'utf8');
    const pillars = readFileSync('components/sections/ThreePillars.tsx', 'utf8');

    expect(promo).toContain('FREEZE ANYTIME');
    expect(promo).toContain('NO CANCELLATION FEES');
    expect(homePage).toContain('<MembershipFreedomStrip />');
    expect(joinPage).toContain('<MembershipFreedomStrip showCta={false} />');
    expect(promo).toContain('items-center justify-center gap-5 text-center');
    expect(pillars).toContain('EVENT CHOREOGRAPHY');
  });
});
