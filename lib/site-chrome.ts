const studioPrefixes = [
  '/admin',
  '/dashboard',
  '/instructor',
  '/member',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
] as const;

export function usesStudioChrome(pathname: string): boolean {
  return studioPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
