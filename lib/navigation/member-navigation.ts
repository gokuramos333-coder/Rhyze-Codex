import type { Role } from '@prisma/client';

const memberNavigation = [
  { href: '/member', label: 'Home' },
  { href: '/member/profile', label: 'Profile' },
  { href: '/member/bookings', label: 'Bookings' },
  { href: '/member/membership', label: 'Membership' },
  { href: '/member/messages', label: 'Messages' },
  { href: '/member/notifications', label: 'Notifications' },
  { href: '/member/billing', label: 'Billing' },
];

export function memberNavigationForRole(role: Role) {
  return role === 'INSTRUCTOR'
    ? [
        ...memberNavigation.slice(0, -1),
        { href: '/instructor', label: 'Instructor view' },
        memberNavigation.at(-1)!,
      ]
    : memberNavigation;
}
