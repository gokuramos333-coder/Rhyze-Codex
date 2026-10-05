import * as React from 'react';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(async () => 0) }));
vi.mock('@/lib/auth/session', () => ({ requireApprovedOwner: async () => ({ id: 'owner', role: 'OWNER', name: 'Admin', email: 'owner@example.test' }) }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { inAppNotification: mocks } }));
vi.mock('@/components/app-shell/PortalShell', () => ({ PortalShell: ({ children }: { children: ReactNode }) => createElement('main', {}, children) }));
vi.mock('@/app/(studio)/admin/notification-actions', () => ({ dismissAdminNotificationAction: async () => {} }));
import AdminLayout from '@/app/(studio)/admin/layout';
vi.stubGlobal('React', React);
describe('failed payment admin alerts', () => {
  it('renders the actionable billing alert above admin pages alongside cancellations', async () => {
    mocks.findMany.mockResolvedValue([{ id: 'notice', title: 'Membership payment failed: Test Member', body: 'Test Member: $199.00 could not be collected.', link: '/admin/members/member#payment-history' }]);
    const html = renderToStaticMarkup(await AdminLayout({ children: createElement('p', {}, 'Admin content') }));
    expect(html).toContain('Membership payment failed: Test Member');
    expect(html).toContain('$199.00');
    expect(html).toContain('/admin/members/member#payment-history');
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'owner', readAt: null, OR: [
      { dedupeKey: { startsWith: 'booking-cancelled-admin:' } }, { dedupeKey: { startsWith: 'payment-failed-admin:' } },
    ] }) }));
  });
  it('ships matching audited approval migrations for the new transactional template', () => {
    const prisma = readFileSync('prisma/migrations/20261005021500_payment_failure_admin_alerts/migration.sql', 'utf8');
    expect(readFileSync('netlify/database/migrations/20261005021500_payment_failure_admin_alerts.sql', 'utf8')).toBe(prisma);
    expect(prisma).toContain("'ADMIN_PAYMENT_FAILED'");
    expect(prisma).toContain('email.payment-failure-alerts-approved');
  });
});
