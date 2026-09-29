/** Use the configured public origin: a hosting proxy may expose an internal Request URL. */
export function isTrustedAdminOrigin(request: Request): boolean {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured && process.env.NODE_ENV === 'production') return false;
  try {
    const expected = new URL(configured || request.url);
    if (!['https:', 'http:'].includes(expected.protocol)) return false;
    return request.headers.get('origin') === expected.origin;
  } catch {
    return false;
  }
}
