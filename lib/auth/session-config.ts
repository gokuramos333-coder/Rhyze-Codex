export const AUTH_SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export function authSessionCookie(environment = process.env.NODE_ENV) {
  const secure = environment === 'production';
  return {
    name: `${secure ? '__Secure-' : ''}authjs.session-token`,
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      secure,
      maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
    },
  };
}

export function isJwtCredentialStale(
  issuedAtSeconds: number | undefined,
  credentialsUpdatedAt: Date | null,
): boolean {
  if (typeof issuedAtSeconds !== 'number' || !credentialsUpdatedAt) return false;
  // JWT `iat` is only precise to the second. Treat a token created in the
  // same second as a password change as current; only an earlier second is
  // stale. This prevents a successful reset/login from being invalidated
  // immediately because the database timestamp includes milliseconds.
  return issuedAtSeconds < Math.floor(credentialsUpdatedAt.getTime() / 1000);
}
