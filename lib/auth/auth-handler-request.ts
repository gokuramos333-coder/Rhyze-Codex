import { NextRequest } from 'next/server';

// Netlify 5.16 initializes Next with the first request's hostname. Next 15 then
// reuses that hostname in request.url. Use the current HTTP Host, never a
// client-supplied forwarded-host or callback URL, at this auth-only boundary.
export function authRequestOrigin(request: NextRequest): NextRequest | null {
  const host = request.headers.get('host');
  if (!host) return null;
  const productionHost = host === 'www.rhyzefitness.com' || host === 'rhyzefitness.com' ||
    /^[a-f0-9]{24}--rhyze-fitness-rhyze-2\.netlify\.app$/.test(host);
  const localHost = process.env.NODE_ENV !== 'production' &&
    /^(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$/.test(host);
  if (!productionHost && !localHost) return null;
  const url = new URL(request.url);
  url.host = host;
  if (productionHost) url.protocol = 'https:';
  // Do not silently fight an explicit Auth.js origin override.
  const configured = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (configured) {
    try { if (new URL(configured).origin !== url.origin) return null; }
    catch { return null; }
  }
  return new NextRequest(url, request);
}
