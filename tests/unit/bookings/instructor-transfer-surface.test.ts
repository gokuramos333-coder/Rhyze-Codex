import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('instructor transfer surface', () => {
  it('offers transfer credit without exposing restore credit to instructors', () => {
    const rosterPage = readFileSync(
      'app/(portal)/instructor/classes/[occurrenceId]/roster/page.tsx',
      'utf8',
    );
    const roster = readFileSync('components/attendance/Roster.tsx', 'utf8');

    expect(rosterPage).toContain('canTransfer={transfersAvailable}');
    expect(rosterPage).not.toContain('canRestore');
    expect(roster).toContain('Transfer credit');
  });
});
