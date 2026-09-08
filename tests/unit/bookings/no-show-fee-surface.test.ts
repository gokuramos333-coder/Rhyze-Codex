import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('no-show attendance fees', () => {
  it('charges the automatic no-show fee when staff marks a booked member no-show', () => {
    const action = readFileSync(
      'app/(portal)/instructor/classes/[occurrenceId]/roster/actions.ts',
      'utf8',
    );

    expect(action).toContain('chargeAttendanceFee');
    expect(action).toContain("feeType: 'NO_SHOW'");
    expect(action).toContain('no-show-fee-${booking.id}');
    expect(action).toContain('noShowFeeDecision');
    expect(action).toContain('bookingAccessType');
    expect(action).toContain('policySnapshot: booking.policySnapshot');
    expect(action).toContain('refundAttendanceFee');
    expect(action).toContain('refund-no-show-fee-failed-attendance-${booking.id}');
    expect(action).not.toContain("kind: 'TRANSFER_FEE'");
  });

  it('redirects back to the right roster with a saved result after attendance changes', () => {
    const action = readFileSync(
      'app/(portal)/instructor/classes/[occurrenceId]/roster/actions.ts',
      'utf8',
    );
    const adminRosterPage = readFileSync(
      'app/(studio)/admin/schedule/[occurrenceId]/roster/page.tsx',
      'utf8',
    );

    expect(action).toContain('attendanceRosterPath');
    expect(action).toContain('/admin/schedule/${occurrenceId}/roster');
    expect(action).toContain('transition.action === \'CLEAR\' ? \'attendance-cleared\' : `attendance-${status.toLowerCase()}`');
    expect(adminRosterPage).toContain('Attendance saved: no-show.');
  });
});
