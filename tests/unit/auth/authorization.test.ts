import { describe, expect, it } from 'vitest';
import {
  canAccessArea,
  dashboardPathForRole,
} from '@/lib/auth/authorization';

describe('portal authorization', () => {
  it('routes each role to the correct home', () => {
    expect(dashboardPathForRole('OWNER')).toBe('/admin');
    expect(dashboardPathForRole('ADMIN')).toBe('/admin');
    expect(dashboardPathForRole('MANAGER')).toBe('/admin');
    expect(dashboardPathForRole('INSTRUCTOR')).toBe('/instructor');
    expect(dashboardPathForRole('MEMBER')).toBe('/member');
  });

  it('allows staff roles into the admin area but not members or instructors', () => {
    expect(canAccessArea('OWNER', 'admin')).toBe(true);
    expect(canAccessArea('MANAGER', 'admin')).toBe(true);
    expect(canAccessArea('INSTRUCTOR', 'admin')).toBe(false);
    expect(canAccessArea('MEMBER', 'admin')).toBe(false);
  });

  it('allows every active account into its self-service member area', () => {
    expect(canAccessArea('OWNER', 'member')).toBe(true);
    expect(canAccessArea('INSTRUCTOR', 'member')).toBe(true);
    expect(canAccessArea('MEMBER', 'member')).toBe(true);
  });
});
