import type { ReactNode } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { PortalShell } from '@/components/app-shell/PortalShell';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { dismissAdminNotificationAction } from './notification-actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const navigation = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/activity', label: 'Activity' },
  { href: '/admin/members', label: 'Clients' },
  { href: '/admin/products', label: 'Memberships' },
  {
    href: '/admin/classes',
    label: 'Classes',
    children: [
      {
        href: '/admin/classes#scheduled-classes',
        label: 'Scheduled Classes',
      },
      {
        href: '/admin/classes#create-a-class',
        label: 'Create a Class',
      },
      {
        href: '/admin/classes#edit-a-class',
        label: 'Edit a Class',
      },
    ],
  },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/payments', label: 'Sales' },
  { href: '/admin/instructors', label: 'Instructors' },
  { href: '/admin/messages', label: 'Messages' },
  { href: '/admin/email-archive', label: 'Email archive' },
  { href: '/admin/email-previews', label: 'Email previews' },
  { href: '/admin/slideshow', label: 'Slideshow' },
  { href: '/admin/integrations', label: 'Integrations' },
  { href: '/admin/settings', label: 'Settings' },
  { href: '/member', label: 'My member view' },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireApprovedOwner();
  const unreadCount = await prisma.inAppNotification.count({
    where: {
      userId: user.id,
      readAt: null,
      link: { startsWith: '/admin/messages/' },
    },
  });
  const latestCancellationAlerts = await prisma.inAppNotification.findMany({
    where: {
      userId: user.id,
      readAt: null,
      dedupeKey: { startsWith: 'booking-cancelled-admin:' },
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });
  const cancellationUnreadCount = latestCancellationAlerts.length;
  const navigationWithBadges = navigation.map((item) =>
    item.href === '/admin/messages'
      ? { ...item, badge: unreadCount }
      : item.href === '/admin/activity'
        ? { ...item, badge: cancellationUnreadCount }
        : item,
  );

  return (
    <PortalShell
      area="ADMIN"
      user={user}
      navigation={navigationWithBadges}
      unreadCount={unreadCount + cancellationUnreadCount}
    >
      {latestCancellationAlerts.length > 0 && (
        <div className="mb-5 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 shadow-lg shadow-red-950/5">
          <p className="font-black uppercase tracking-[0.18em] text-red-700">
            Recent class cancellation
          </p>
          <div className="mt-3 grid gap-2">
            {latestCancellationAlerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-start gap-2 rounded-2xl bg-white/80 p-3 transition hover:bg-white"
              >
                <Link
                  href={alert.link || '/admin/activity'}
                  className="min-w-0 flex-1"
                >
                  <span className="block font-black">{alert.title}</span>
                  <span className="mt-1 block text-red-900/75">{alert.body}</span>
                </Link>
                <form action={dismissAdminNotificationAction}>
                  <input type="hidden" name="notificationId" value={alert.id} />
                  <button
                    type="submit"
                    aria-label={`Dismiss ${alert.title}`}
                    title="Dismiss notification"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-red-800/60 transition hover:bg-red-100 hover:text-red-950"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}
      {children}
    </PortalShell>
  );
}
