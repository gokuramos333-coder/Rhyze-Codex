import type { ReactNode } from 'react';
import { PortalShell } from '@/components/app-shell/PortalShell';
import { requireArea } from '@/lib/auth/session';

const navigation = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/members', label: 'Members' },
  { href: '/admin/classes', label: 'Classes' },
  { href: '/admin/schedule', label: 'Schedule' },
  { href: '/admin/waivers', label: 'Waivers' },
  { href: '/dashboard', label: 'RHYZE #2 preview' },
  { href: '/member', label: 'My member view' },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireArea('admin');

  return (
    <PortalShell area="Studio OS" user={user} navigation={navigation}>
      {children}
    </PortalShell>
  );
}
