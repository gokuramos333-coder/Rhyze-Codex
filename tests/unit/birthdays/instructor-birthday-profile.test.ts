import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('instructor birthday profile', () => {
  it('lets approved instructors save birthday month and day without a year', () => {
    const page = readFileSync('app/(portal)/instructor/profile/page.tsx', 'utf8');
    const actions = readFileSync('app/(portal)/instructor/profile/actions.ts', 'utf8');

    expect(page).toContain('BirthdayFields');
    expect(page).toContain('updateInstructorBirthdayAction');
    expect(actions).toContain('birthdayDateFromMonthDay');
    expect(actions).toContain('memberProfile.upsert');
  });
});
