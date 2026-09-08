import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dedupeAssignableInstructors, instructorOptionLabel } from '@/lib/admin/assignable-instructors';

describe('admin assignable instructors', () => {
  it('dedupes duplicate instructor names in class/schedule dropdowns', () => {
    const instructors = dedupeAssignableInstructors([
      { id: 'placeholder-melissa', name: 'Melissa Llanos', email: 'melissa@rhyze.local' },
      { id: 'owner-melissa', name: 'Melissa Llanos', email: 'melissa@rhyzefit.com' },
      { id: 'julie', name: 'Julie Reese', email: 'julie@example.com' },
    ]);

    expect(instructors.map((item) => item.id)).toEqual(['julie', 'owner-melissa']);
    expect(instructorOptionLabel(instructors[1])).toBe('Melissa Llanos');
  });

  it('uses active instructor profiles, not only INSTRUCTOR role, so owner-instructors like Melissa appear', () => {
    const classesPage = readFileSync('app/(studio)/admin/classes/page.tsx', 'utf8');
    const schedulePage = readFileSync('app/(studio)/admin/schedule/page.tsx', 'utf8');
    const managePage = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/page.tsx', 'utf8');
    const actions = readFileSync('app/(studio)/admin/classes/actions.ts', 'utf8');

    const helper = readFileSync('lib/admin/assignable-instructors.ts', 'utf8');

    expect(classesPage).toContain('dedupeAssignableInstructors');
    expect(schedulePage).toContain('dedupeAssignableInstructors');
    expect(managePage).toContain('dedupeAssignableInstructors');
    expect(classesPage).toContain('assignableInstructorWhere');
    expect(schedulePage).toContain('assignableInstructorWhere');
    expect(managePage).toContain('assignableInstructorWhere');
    expect(actions).toContain('assignableInstructorWhere');
    expect(helper).toContain('instructorProfile: { is: { isActive: true } }');
    expect(helper).toContain('melissa@rhyzefit.com');
    expect(actions).not.toContain("role: 'INSTRUCTOR',\n        instructorProfile");
  });
});
