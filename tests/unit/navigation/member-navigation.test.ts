import { describe, expect, it } from 'vitest';
import { memberNavigationForRole } from '@/lib/navigation/member-navigation';

describe('member portal navigation', () => {
  it('gives instructors a way back to instructor view', () => {
    expect(memberNavigationForRole('INSTRUCTOR')).toContainEqual({
      href: '/instructor',
      label: 'Instructor view',
    });
  });

  it('does not show the instructor link to regular members', () => {
    expect(memberNavigationForRole('MEMBER')).not.toContainEqual(
      expect.objectContaining({ href: '/instructor' }),
    );
  });
});
