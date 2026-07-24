import type { ReactNode } from 'react';
import { PortalShell } from '@/components/app-shell/PortalShell';
import { requireApprovedOwner } from '@/lib/auth/session';

const navigation = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/activity', label: 'Activity' },
  { href: '/admin/members', label: 'Clients' },
  { href: '/admin/offerings', label: 'Offerings' },
  { href: '/admin/schedule', label: 'Schedule' },
  { href: '/admin/payments', label: 'Sales' },
  { href: '/admin/reports', label: 'Engagement' },
  { href: '/admin/messages', label: 'Messages' },
  { href: '/admin/campaigns', label: 'Promotions' },
  { href: '/admin/integrations', label: 'Integrations' },
  { href: '/admin/reviews', label: 'Reviews' },
  { href: '/admin/settings', label: 'Settings' },
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
