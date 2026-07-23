import { describe, expect, it } from 'vitest';
import { AUTH_SESSION_MAX_AGE_SECONDS } from '@/lib/auth/session-config';

describe('authentication session', () => {
  it('persists for one year', () => {
    expect(AUTH_SESSION_MAX_AGE_SECONDS).toBe(365 * 24 * 60 * 60);
  });
});
