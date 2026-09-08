import type { ReactNode } from 'react';
import { PortalShell } from '@/components/app-shell/PortalShell';
import { requireArea } from '@/lib/auth/session';
import { memberNavigationForRole } from '@/lib/navigation/member-navigation';
import { prisma } from '@/lib/db/prisma';
import { UnreadNotificationAlert } from '@/components/member/UnreadNotificationAlert';

export default async function MemberLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireArea('member');
  const [unreadNotification, unreadCount] = await Promise.all([
    prisma.inAppNotification.findFirst({
      where: {
        userId: user.id,
        readAt: null,
        link: { startsWith: '/member/' },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, body: true, link: true },
    }),
    prisma.memberConversationMessage.count({
      where: {
        conversation: { memberId: user.id },
        senderId: { not: user.id },
        memberReadAt: null,
      },
    }),
  ]);
  const navigation = memberNavigationForRole(user.role).map((item) =>
    item.href === '/member/messages' ? { ...item, badge: unreadCount } : item,
  );

  return (
    <PortalShell
      area="My Rhyze"
      user={user}
      navigation={navigation}
      unreadCount={unreadCount}
    >
      {unreadNotification && (
        <UnreadNotificationAlert notification={unreadNotification} />
      )}
      {children}
    </PortalShell>
  );
}
