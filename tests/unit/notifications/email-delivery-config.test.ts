import { describe, expect, it } from 'vitest';
import {
  emailDeliveryEnabled,
  emailDeliveryResumeAt,
} from '@/lib/notifications/email-delivery-config';

describe('email delivery configuration', () => {
  it('stays paused unless delivery is explicitly enabled', () => {
    expect(emailDeliveryEnabled(undefined)).toBe(false);
    expect(emailDeliveryEnabled('false')).toBe(false);
    expect(emailDeliveryEnabled('TRUE')).toBe(false);
    expect(emailDeliveryEnabled('true')).toBe(true);
  });

  it('uses a valid resume cutoff to prevent stale queued tests from sending', () => {
    expect(emailDeliveryResumeAt(undefined)).toBeNull();
    expect(emailDeliveryResumeAt('not-a-date')).toBeNull();
    expect(
      emailDeliveryResumeAt('2026-07-28T05:20:00.000Z')?.toISOString(),
    ).toBe('2026-07-28T05:20:00.000Z');
  });
});
