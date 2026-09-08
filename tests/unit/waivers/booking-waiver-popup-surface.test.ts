import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('booking waiver prompt surface', () => {
  const page = readFileSync('app/(portal)/member/bookings/new/page.tsx', 'utf8');

  it('checks waiver acceptance before the confirmation form and shows an immediate popup-style prompt', () => {
    expect(page).toContain('missingWaiver');
    expect(page).toContain('waiverVersionId_userId');
    expect(page).toContain('Missing required waivers');
    expect(page).toContain('check the large required agreement box');
    expect(page).toContain('Review and sign waiver');
    expect(page).toContain('role="dialog"');
    expect(page).toContain('Waiver required before booking');
    expect(page).toContain('disabled');
    expect(page.indexOf('waiverVersionId_userId')).toBeLessThan(
      page.indexOf('<form action={bookOccurrenceAction}>'),
    );
  });
});
