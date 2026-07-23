import { describe, expect, it } from 'vitest';
import { waiverReminderKind } from '@/lib/domain/waivers/reminder-service';

describe('waiver reminder selection', () => {
  const now = new Date('2026-07-24T16:00:00Z');

  it('reminds an unsigned profile after 24 hours', () => {
    expect(
      waiverReminderKind(
        {
          createdAt: new Date('2026-07-23T15:59:00Z'),
          hasAcceptedCurrentVersion: false,
          nextClassAt: null,
        },
        now,
      ),
    ).toBe('24_HOUR');
  });

  it('prioritizes an upcoming class reminder', () => {
    expect(
      waiverReminderKind(
        {
          createdAt: now,
          hasAcceptedCurrentVersion: false,
          nextClassAt: new Date('2026-07-25T12:00:00Z'),
        },
        now,
      ),
    ).toBe('UPCOMING_CLASS');
  });

  it('does not remind a member who signed the current version', () => {
    expect(
      waiverReminderKind(
        {
          createdAt: new Date('2026-07-20T12:00:00Z'),
          hasAcceptedCurrentVersion: true,
          nextClassAt: new Date('2026-07-25T12:00:00Z'),
        },
        now,
      ),
    ).toBeNull();
  });
});
