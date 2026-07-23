import type { ReactNode } from 'react';
import { PortalShell } from '@/components/app-shell/PortalShell';
import { requireArea } from '@/lib/auth/session';

const navigation = [
  { href: '/member', label: 'Home' },
  { href: '/member/bookings', label: 'Bookings' },
  { href: '/member/membership', label: 'Membership' },
  { href: '/member/billing', label: 'Billing' },
  { href: '/member/notifications', label: 'Notifications' },
  { href: '/member/profile', label: 'Profile' },
  { href: '/member/waiver', label: 'Waiver' },
];

export default async function MemberLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireArea('member');

  return (
    <PortalShell area="My Rhyze" user={user} navigation={navigation}>
      {children}
    </PortalShell>
  );
}
