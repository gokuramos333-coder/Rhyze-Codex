import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin roster waitlist visibility', () => {
  it('shows waiting members with contact info on the protected admin roster page', () => {
    const rosterPage = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/roster/page.tsx', 'utf8');

    expect(rosterPage).toContain("waitlistEntries: {");
    expect(rosterPage).toContain("where: { status: 'WAITING' }");
    expect(rosterPage).toContain('memberProfile');
    expect(rosterPage).toContain('Waitlist');
    expect(rosterPage).toContain('entry.user.email');
    expect(rosterPage).toContain('entry.user.memberProfile?.phone');
    expect(rosterPage).toContain("/admin/members/${entry.user.id}");
  });
});
