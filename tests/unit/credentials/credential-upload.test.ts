import { describe, expect, it } from 'vitest';
import { parseOptionalExpiration } from '@/lib/domain/credentials/credential-upload';

describe('optional credential expiration', () => {
  const now = new Date('2026-07-23T16:00:00Z');

  it('accepts a blank expiration date', () => {
    expect(parseOptionalExpiration('', now)).toBeNull();
  });

  it('accepts a future expiration date', () => {
    expect(parseOptionalExpiration('2027-07-23', now)?.toISOString()).toBe(
      '2027-07-23T00:00:00.000Z',
    );
  });

  it('rejects invalid and past expiration dates', () => {
    expect(() => parseOptionalExpiration('not-a-date', now)).toThrow();
    expect(() => parseOptionalExpiration('2025-01-01', now)).toThrow();
  });
});
