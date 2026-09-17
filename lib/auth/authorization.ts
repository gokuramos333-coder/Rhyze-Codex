import type { StudioRole } from './permissions';

export type PortalArea = 'admin' | 'instructor' | 'member';

const areaRoles: Record<PortalArea, readonly StudioRole[]> = {
  admin: ['OWNER', 'ADMIN', 'MANAGER'],
  instructor: ['OWNER', 'ADMIN', 'MANAGER', 'INSTRUCTOR'],
  member: ['OWNER', 'ADMIN', 'MANAGER', 'INSTRUCTOR', 'MEMBER'],
};

export function canAccessArea(
  role: StudioRole,
  area: PortalArea,
): boolean {
  return areaRoles[area].includes(role);
}

export function dashboardPathForRole(role: StudioRole): string {
  if (canAccessArea(role, 'admin')) return '/admin';
  if (role === 'INSTRUCTOR') return '/instructor';
  return '/member';
}
