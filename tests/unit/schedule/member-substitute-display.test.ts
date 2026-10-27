import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('substitute occurrence member display', () => {
  it.each(['app/(portal)/member/page.tsx', 'app/(portal)/member/bookings/page.tsx'])('preserves occurrence title and explicit substitute in %s', path => {
    const source = readFileSync(path, 'utf8');
    expect(source).toContain('occurrenceTitle(booking.occurrence)');
    expect(source).toContain('occurrenceInstructorName(booking.occurrence)');
    expect(source).toContain('booking.occurrence.isSubstitute');
    expect(source).toContain('Substitute');
  });
});
