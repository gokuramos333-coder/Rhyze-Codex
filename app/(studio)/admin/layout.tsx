import type { ReactNode } from 'react';
import { PortalShell } from '@/components/app-shell/PortalShell';
import { requireApprovedOwner } from '@/lib/auth/session';

const navigation = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/members', label: 'Members' },
  { href: '/admin/instructors', label: 'Instructors' },
  { href: '/admin/classes', label: 'Classes' },
  { href: '/admin/schedule', label: 'Schedule' },
  { href: '/admin/waivers', label: 'Waivers' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/campaigns', label: 'Campaigns' },
  { href: '/member', label: 'My member view' },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireApprovedOwner();

  return (
    <PortalShell area="ADMIN" user={user} navigation={navigation}>
      {children}
    </PortalShell>
  );
}
