import type { Role } from '@prisma/client';

const memberNavigation = [
  { href: '/member', label: 'Home' },
  { href: '/member/bookings', label: 'Bookings' },
  { href: '/member/membership', label: 'Membership' },
  { href: '/member/billing', label: 'Billing' },
  { href: '/member/notifications', label: 'Notifications' },
  { href: '/member/profile', label: 'Profile' },
  { href: '/member/waiver', label: 'Waiver' },
];

export function memberNavigationForRole(role: Role) {
  return role === 'INSTRUCTOR'
    ? [...memberNavigation, { href: '/instructor', label: 'Instructor view' }]
    : memberNavigation;
}
