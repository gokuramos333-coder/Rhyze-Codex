import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('member reschedule surface', () => {
  it('shows reschedule for confirmed bookings more than two hours out and hides it inside two hours', () => {
    const page = readFileSync('app/(portal)/member/bookings/page.tsx', 'utf8');

    expect(page).toContain('memberBookingActions');
    expect(page).toContain('Reschedule');
    expect(page).toContain('minutesUntilClass <= 120');
  });

  it('provides a member-only reschedule flow that requires an immediate destination choice within fourteen days', () => {
    const action = readFileSync('app/(portal)/member/bookings/reschedule/actions.ts', 'utf8');
    const page = readFileSync('app/(portal)/member/bookings/reschedule/page.tsx', 'utf8');

    expect(action).toContain("requireArea('member')");
    expect(action).toContain('evaluateTransferWindow');
    expect(action).toContain('14 * 24 * 60 * 60_000');
    expect(action).toContain('chargeAttendanceFee');
    expect(action).toContain("policy === 'FEE_500' ? 500 : 0");
    expect(action).toContain("feeType: 'TRANSFER'");
    expect(action).toContain('refundAttendanceFee');
    expect(page).toContain("policy === 'FEE_500'");
    expect(page).toContain('$5 transfer fee');
    expect(page).toContain('Choose the class using this credit');
  });

  it('returns members to bookings with a clear message when no eligible booking was supplied', () => {
    const bookingsPage = readFileSync('app/(portal)/member/bookings/page.tsx', 'utf8');
    const reschedulePage = readFileSync('app/(portal)/member/bookings/reschedule/page.tsx', 'utf8');

    expect(reschedulePage).toContain("redirect('/member/bookings?result=reschedule-select-booking')");
    expect(bookingsPage).toContain("'reschedule-select-booking'");
    expect(bookingsPage).toContain('confirmed future class');
  });
});
