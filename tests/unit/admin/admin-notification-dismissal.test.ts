import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('admin notification dismissal', () => {
  it('lets the signed-in admin persistently dismiss only their own alert', () => {
    const action = readFileSync(
      'app/(studio)/admin/notification-actions.ts',
      'utf8',
    );
    const layout = readFileSync('app/(studio)/admin/layout.tsx', 'utf8');

    expect(action).toContain('dismissAdminNotificationAction');
    expect(action).toContain('requireApprovedOwner()');
    expect(action).toContain('userId: user.id');
    expect(action).toContain('readAt: null');
    expect(action).toContain('readAt: new Date()');
    expect(layout).toContain('action={dismissAdminNotificationAction}');
    expect(layout).toContain('name="notificationId"');
    expect(layout).toContain('aria-label={`Dismiss ${alert.title}`}');
  });
});
