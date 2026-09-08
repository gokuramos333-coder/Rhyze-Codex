import { describe, expect, it } from 'vitest';
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  authSessionCookie,
  isJwtCredentialStale,
} from '@/lib/auth/session-config';

describe('authentication session', () => {
  it('persists for one year', () => {
    expect(AUTH_SESSION_MAX_AGE_SECONDS).toBe(365 * 24 * 60 * 60);
  });

  it('uses a persistent, secure cookie without changing Auth.js cookie names', () => {
    expect(authSessionCookie('development')).toEqual({
      name: 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
        maxAge: 365 * 24 * 60 * 60,
      },
    });
    expect(authSessionCookie('production')).toMatchObject({
      name: '__Secure-authjs.session-token',
      options: { secure: true },
    });
  });

  it('invalidates only sessions issued before a forgotten-password reset', () => {
    const resetAt = new Date('2026-07-27T18:00:00.500Z');

    expect(isJwtCredentialStale(1785175199, resetAt)).toBe(true);
    expect(isJwtCredentialStale(1785175200, resetAt)).toBe(false);
    expect(isJwtCredentialStale(1785175201, resetAt)).toBe(false);
    expect(isJwtCredentialStale(undefined, resetAt)).toBe(false);
    expect(isJwtCredentialStale(1753639199, null)).toBe(false);
  });
});
