import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('member unread message alert', () => {
  it('loads the latest unread message and count into the member shell', () => {
    const layout = readFileSync('app/(portal)/member/layout.tsx', 'utf8');
    expect(layout).toContain('memberConversationMessage.count');
    expect(layout).toContain('UnreadNotificationAlert');
    expect(layout).toContain('unreadCount={unreadCount}');
    expect(layout).toContain("link: { startsWith: '/member/' }");
    expect(layout).not.toContain("dedupeKey: { startsWith: 'booking-cancelled-admin:' }");
  });

  it('shows a red numeric badge beside the member portal title', () => {
    const shell = readFileSync('components/app-shell/PortalShell.tsx', 'utf8');
    const navigation = readFileSync('components/app-shell/PortalNavigation.tsx', 'utf8');
    const header = readFileSync('components/layout/Header.tsx', 'utf8');
    expect(shell).toContain('unreadCount');
    expect(shell).toContain('bg-red-600');
    expect(shell).toContain('unread management ${');
    expect(header).toContain('/api/member/unread-count');
    expect(header).toContain('Member Portal');
    expect(header).toContain('bg-red-600');
    expect(navigation).toContain('item.badge');
    expect(navigation).toContain('bg-red-600');
  });

  it('adds unread reply counts to member and admin Messages navigation', () => {
    const memberLayout = readFileSync('app/(portal)/member/layout.tsx', 'utf8');
    const adminLayout = readFileSync('app/(studio)/admin/layout.tsx', 'utf8');
    expect(memberLayout).toContain("item.href === '/member/messages'");
    expect(memberLayout).toContain('badge: unreadCount');
    expect(adminLayout).toContain('userId: user.id');
    expect(adminLayout).toContain("link: { startsWith: '/admin/messages/' }");
    expect(adminLayout).toContain("item.href === '/admin/messages'");
    expect(adminLayout).toContain('badge: unreadCount');
  });
});
