import { describe, expect, it } from 'vitest';
import { credentialReminderKind } from '@/lib/domain/credentials/reminder-service';

describe('credential reminder selection', () => {
  const now = new Date('2026-12-02T12:00:00Z');

  it('selects the exact expiration reminder window', () => {
    expect(credentialReminderKind(new Date('2027-01-01T12:00:00Z'), now)).toBe('30_DAY');
    expect(credentialReminderKind(new Date('2026-12-09T12:00:00Z'), now)).toBe('7_DAY');
    expect(credentialReminderKind(new Date('2026-12-03T12:00:00Z'), now)).toBe('1_DAY');
  });

  it('returns expired after the expiration timestamp', () => {
    expect(credentialReminderKind(new Date('2026-12-01T12:00:00Z'), now)).toBe('EXPIRED');
  });

  it('ignores credentials outside reminder windows', () => {
    expect(credentialReminderKind(new Date('2027-03-01T12:00:00Z'), now)).toBeNull();
  });
});
