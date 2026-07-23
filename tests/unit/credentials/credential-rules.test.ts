import { describe, expect, it } from 'vitest';
import {
  credentialReminderDates,
  validateUploadMetadata,
} from '@/lib/domain/credentials/credential-rules';

describe('credential rules', () => {
  it('schedules missing and expiration reminders', () => {
    const approvedAt = new Date('2026-01-01T12:00:00Z');
    const expiresAt = new Date('2027-01-01T12:00:00Z');
    const dates = credentialReminderDates(approvedAt, expiresAt);
    expect(dates.missingAt.toISOString()).toBe('2026-01-03T12:00:00.000Z');
    expect(dates.expiration.map((date) => date.toISOString())).toEqual([
      '2026-12-02T12:00:00.000Z',
      '2026-12-25T12:00:00.000Z',
      '2026-12-31T12:00:00.000Z',
    ]);
  });

  it('accepts PDF, JPEG, and PNG files no larger than 8 MB', () => {
    expect(validateUploadMetadata({ type: 'application/pdf', size: 1_000 })).toEqual({ valid: true });
    expect(validateUploadMetadata({ type: 'image/jpeg', size: 8 * 1024 * 1024 })).toEqual({ valid: true });
  });

  it('rejects unsafe types and oversized files', () => {
    expect(validateUploadMetadata({ type: 'text/html', size: 100 }).valid).toBe(false);
    expect(validateUploadMetadata({ type: 'image/png', size: 8 * 1024 * 1024 + 1 }).valid).toBe(false);
  });
});
