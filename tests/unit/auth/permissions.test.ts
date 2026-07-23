import { describe, expect, it } from 'vitest';
import {
  hasPermission,
  type Permission,
  type StudioRole,
} from '@/lib/auth/permissions';

const allRoles: StudioRole[] = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'INSTRUCTOR',
  'MEMBER',
];

describe('hasPermission', () => {
  it('gives the owner every studio permission', () => {
    const permissions: Permission[] = [
      'studio:manage',
      'members:manage',
      'schedule:manage',
      'billing:refund',
      'reports:view',
      'roster:manage-assigned',
      'profile:manage-self',
    ];

    expect(permissions.every((permission) => hasPermission('OWNER', permission)))
      .toBe(true);
  });

  it('prevents managers from changing studio ownership or issuing refunds', () => {
    expect(hasPermission('MANAGER', 'studio:manage')).toBe(false);
    expect(hasPermission('MANAGER', 'billing:refund')).toBe(false);
    expect(hasPermission('MANAGER', 'schedule:manage')).toBe(true);
  });

  it('limits instructors to their own profile and assigned rosters', () => {
    expect(hasPermission('INSTRUCTOR', 'profile:manage-self')).toBe(true);
    expect(hasPermission('INSTRUCTOR', 'roster:manage-assigned')).toBe(true);
    expect(hasPermission('INSTRUCTOR', 'members:manage')).toBe(false);
  });

  it('limits members to self-service permissions', () => {
    expect(hasPermission('MEMBER', 'profile:manage-self')).toBe(true);
    expect(hasPermission('MEMBER', 'schedule:manage')).toBe(false);
  });

  it('defines a permission set for every role', () => {
    expect(allRoles.every((role) => hasPermission(role, 'profile:manage-self')))
      .toBe(true);
  });
});
