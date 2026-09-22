/** Edge-safe, first-touch marketing data. Never used for authorization or pricing. */
export const ATTRIBUTION_COOKIE = 'rhyze_attribution';
export const ATTRIBUTION_MAX_AGE = 90 * 24 * 60 * 60;
const campaignKeys = [
  'fbclid',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;
const cookieKeys = [...campaignKeys, 'referrer', 'landing_path'] as const;
type CookieKey = (typeof cookieKeys)[number];
export type FirstTouch = Record<CookieKey, string> & { captured_at: string };

export type SourceAttribution = {
  source_label: string;
  source_fbclid: string | null;
  source_utm_source: string | null;
  source_utm_medium: string | null;
  source_utm_campaign: string | null;
  source_utm_term: string | null;
  source_utm_content: string | null;
  source_referrer: string | null;
  source_landing_path: string | null;
  source_captured_at: Date;
};

export const sourceAttributionSelect = {
  source_label: true,
  source_fbclid: true,
  source_utm_source: true,
  source_utm_medium: true,
  source_utm_campaign: true,
  source_utm_term: true,
  source_utm_content: true,
  source_referrer: true,
  source_landing_path: true,
  source_captured_at: true,
} as const;

function bounded(value: unknown): string {
  // Array.from avoids slicing a surrogate pair before cookie URL encoding.
  return typeof value === 'string'
    ? Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ''))
        .slice(0, 250)
        .join('')
    : '';
}

function safePath(path: string): string {
  // A first visit can be a password-reset/account-claim link. Never retain tokens.
  return bounded(
    path.replace(
      /(\/(?:reset-password|claim-account|activate-account|verify-email|confirm-email)\/)[^/]+/gi,
      '$1[redacted]',
    ),
  );
}

function safeReferrer(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.username = '';
    url.password = '';
    url.hash = '';
    url.pathname = safePath(url.pathname);
    for (const key of [...url.searchParams.keys()]) {
      if (/token|secret|password|email|code|session/i.test(key))
        url.searchParams.delete(key);
    }
    return bounded(url.toString());
  } catch {
    return '';
  }
}

export function captureFirstTouch(
  url: URL,
  referrer: string | null,
  now = new Date(),
): FirstTouch {
  const values = Object.fromEntries(
    campaignKeys.map((key) => [key, bounded(url.searchParams.get(key))]),
  );
  const data = {
    ...values,
    referrer: safeReferrer(referrer),
    landing_path: safePath(url.pathname),
    captured_at: now.toISOString(),
  } as FirstTouch;
  // Cookie limits count percent-encoded bytes. Keep even long unicode campaigns
  // comfortably below 4KB so signup never loses its entire attribution cookie.
  while (encodeURIComponent(JSON.stringify(data)).length > 3500) {
    const longest = [...cookieKeys].sort(
      (a, b) =>
        encodeURIComponent(data[b]).length - encodeURIComponent(data[a]).length,
    )[0];
    data[longest] = Array.from(data[longest]).slice(0, -1).join('');
  }
  return data;
}

function label(data: FirstTouch, origin: string): string {
  if (
    data.fbclid ||
    ['meta', 'facebook', 'instagram'].includes(
      data.utm_source.trim().toLowerCase(),
    )
  )
    return 'Meta Ad';
  if (data.utm_source) return data.utm_source;
  try {
    const host = new URL(data.referrer).hostname.toLowerCase();
    const ownHost = new URL(origin).hostname
      .toLowerCase()
      .replace(/^www\./, '');
    if (host.replace(/^www\./, '') === ownHost) return 'Direct';
    if (host.includes('google') || host.includes('bing'))
      return 'Organic Search';
    return `Referral: ${host}`;
  } catch {
    return 'Direct';
  }
}

/** Cookie is visitor-controlled: allowlist fields and derive the label server-side. */
export function attributionFromCookie(
  value: string | undefined,
  origin: string,
  now = new Date(),
): SourceAttribution {
  let input: Record<string, unknown> = {};
  try {
    const parsed: unknown =
      value && value.length <= 16000 ? JSON.parse(value) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      input = parsed as Record<string, unknown>;
  } catch {
    /* Missing/malformed attribution must never prevent account creation. */
  }
  const data = Object.fromEntries(
    cookieKeys.map((key) => [key, bounded(input[key])]),
  ) as FirstTouch;
  data.referrer = safeReferrer(input.referrer);
  data.landing_path =
    data.landing_path.startsWith('/') && !data.landing_path.startsWith('//')
      ? safePath(data.landing_path.split('?')[0])
      : '';
  const timestamp =
    typeof input.captured_at === 'string' ? new Date(input.captured_at) : now;
  const capturedAt =
    Number.isFinite(timestamp.getTime()) &&
    timestamp.getTime() >= 0 &&
    timestamp <= now
      ? timestamp
      : now;
  return {
    source_label: label(data, origin),
    source_fbclid: data.fbclid || null,
    source_utm_source: data.utm_source || null,
    source_utm_medium: data.utm_medium || null,
    source_utm_campaign: data.utm_campaign || null,
    source_utm_term: data.utm_term || null,
    source_utm_content: data.utm_content || null,
    source_referrer: data.referrer || null,
    source_landing_path: data.landing_path || null,
    source_captured_at: capturedAt,
  };
}

type StoredAttribution = Partial<{
  [K in keyof SourceAttribution]: SourceAttribution[K] | null;
}>;

/** Use saved member data, never the current checkout URL/cookie or staff browser. */
export function attributionMetadata(
  member: StoredAttribution | null | undefined,
): Record<string, string> {
  if (!member?.source_label) return {};
  return Object.fromEntries(
    Object.keys(sourceAttributionSelect).map((key) => {
      const value = member[key as keyof SourceAttribution];
      return [
        key,
        value instanceof Date ? value.toISOString() : bounded(value),
      ];
    }),
  );
}
