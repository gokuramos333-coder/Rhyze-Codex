export const studioRoles = [
  'OWNER',
  'ADMIN',
  'MANAGER',
  'INSTRUCTOR',
  'MEMBER',
] as const;

export type StudioRole = (typeof studioRoles)[number];

export type Permission =
  | 'studio:manage'
  | 'members:manage'
  | 'schedule:manage'
  | 'billing:refund'
  | 'reports:view'
  | 'roster:manage-assigned'
  | 'profile:manage-self';

const rolePermissions = {
  OWNER: [
    'studio:manage',
    'members:manage',
    'schedule:manage',
    'billing:refund',
    'reports:view',
    'roster:manage-assigned',
    'profile:manage-self',
  ],
  ADMIN: [
    'members:manage',
    'schedule:manage',
    'billing:refund',
    'reports:view',
    'roster:manage-assigned',
    'profile:manage-self',
  ],
  MANAGER: [
    'members:manage',
    'schedule:manage',
    'reports:view',
    'roster:manage-assigned',
    'profile:manage-self',
  ],
  INSTRUCTOR: ['roster:manage-assigned', 'profile:manage-self'],
  MEMBER: ['profile:manage-self'],
} as const satisfies Record<StudioRole, readonly Permission[]>;

export function hasPermission(
  role: StudioRole,
  permission: Permission,
): boolean {
  return (rolePermissions[role] as readonly Permission[]).includes(permission);
}
