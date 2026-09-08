import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin attendance credit restore surface', () => {
  it('restores a rollover credit and sends staff to the client profile with two-week notice', () => {
    const action = readFileSync(
      'app/(portal)/instructor/classes/[occurrenceId]/roster/actions.ts',
      'utf8',
    );
    const profile = readFileSync('app/(studio)/admin/members/[userId]/page.tsx', 'utf8');

    expect(action).toContain('redirect(');
    expect(action).toContain('/admin/members/${booking.userId}?sent=attendance-credit-restored#credits');
    expect(action).toContain('returnedCreditTerms');
    expect(action).toContain('Manual attendance credit restore');
    expect(action).toContain("template: 'ATTENDANCE_CREDIT_RESTORED_STAFF'");
    expect(action).toContain("to: 'melissa@rhyzefit.com'");
    expect(action).toContain("cc: ['vanessa@rhyzefit.com']");
    expect(action).toContain('no-reservation fallback');
    expect(profile).toContain('id="credits"');
    expect(profile).toContain('Credit must be applied within 2 weeks');
  });
});
