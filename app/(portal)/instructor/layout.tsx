import type { ReactNode } from 'react';
import { PortalShell } from '@/components/app-shell/PortalShell';
import { requireArea } from '@/lib/auth/session';

const navigation = [
  { href: '/instructor', label: 'Teaching home' },
  { href: '/instructor/schedule', label: 'My classes' },
  { href: '/instructor/profile', label: 'Profile' },
  { href: '/member', label: 'My member view' },
];

export default async function InstructorLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireArea('instructor');

  return (
    <PortalShell area="Instructor" user={user} navigation={navigation}>
      {children}
    </PortalShell>
  );
}
