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

  it('puts Profile after Home, Billing last, and omits Waiver', () => {
    const navigation = memberNavigationForRole('MEMBER');
    expect(navigation.slice(0, 2).map((item) => item.label)).toEqual([
      'Home',
      'Profile',
    ]);
    expect(navigation.at(-1)?.label).toBe('Billing');
    expect(navigation.some((item) => item.label === 'Waiver')).toBe(false);
  });
});
