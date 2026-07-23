import type { ReactNode } from 'react';
import { PortalShell } from '@/components/app-shell/PortalShell';
import { requireArea } from '@/lib/auth/session';
import { memberNavigationForRole } from '@/lib/navigation/member-navigation';

export default async function MemberLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireArea('member');

  return (
    <PortalShell
      area="My Rhyze"
      user={user}
      navigation={memberNavigationForRole(user.role)}
    >
      {children}
    </PortalShell>
  );
}
