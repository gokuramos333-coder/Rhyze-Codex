import { describe, expect, it } from 'vitest';
import { birthdayReminderExpired } from '@/lib/domain/birthdays/birthday-delivery';
describe('birthday email freshness', () => {
  const now = new Date('2026-10-12T10:00:00Z');
  it('expires delayed birthday notices, leaving other message types alone', () => {
    expect(birthdayReminderExpired({template:'BIRTHDAY_WEEK_AHEAD', scheduledFor:new Date('2026-10-10')}, now)).toBe(true);
    expect(birthdayReminderExpired({template:'BIRTHDAY_MONTHLY_DIGEST', scheduledFor:new Date('2026-10-01')}, now)).toBe(true);
    expect(birthdayReminderExpired({template:'BIRTHDAY_WEEK_AHEAD', scheduledFor:now}, now)).toBe(false);
    expect(birthdayReminderExpired({template:'BOOKING_CONFIRMATION', scheduledFor:new Date('2026-07-01')}, now)).toBe(false);
  });
});
