const DIAGNOSTIC_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN',
  'UND_ERR_SOCKET', 'ECONNRESET', 'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT', 'ETIMEDOUT', 'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);
const PRE_CONNECTION_ERRORS = new Set(['UND_ERR_CONNECT_TIMEOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

export async function runProtectedJob(
  path: string,
  body?: unknown,
  options: { retryConnectFailures?: boolean } = {},
) {
  const siteUrl = process.env.URL;
  const jobSecret = process.env.JOB_SECRET;
  if (!siteUrl || !jobSecret) {
    throw new Error('URL and JOB_SECRET are required for scheduled jobs.');
  }
  if (options.retryConnectFailures && !['/api/jobs/stripe-sync', '/api/jobs/email'].includes(path)) {
    throw new Error('Connection retries are only enabled for Stripe safety sync and the email worker.');
  }
  // One shared deadline leaves headroom under Netlify's 30-second scheduled limit.
  const controller = options.retryConnectFailures ? new AbortController() : undefined;
  const deadline = Date.now() + 25_000;
  const timer = controller ? setTimeout(() => controller.abort(), 25_000) : undefined;
  try {
    for (let attempt = 1; ; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${siteUrl}${path}`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${jobSecret}`,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          ...(controller ? { signal: controller.signal, redirect: 'error' as const } : {}),
        });
      } catch (error) {
        const cause = error instanceof Error ? error.cause : undefined;
        const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined;
        // Never replay socket resets, response timeouts, HTTP errors or unknown
        // failures: the POST may already have processed financial records.
        if (controller && !controller.signal.aborted && Date.now() + 500 < deadline && attempt === 1 &&
            typeof code === 'string' && PRE_CONNECTION_ERRORS.has(code)) {
          console.warn(`${path} connection retry (${code})`);
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        const reason = controller?.signal.aborted ? 'deadline exceeded'
          : typeof code === 'string' && DIAGNOSTIC_CODES.has(code) ? code : 'UNKNOWN_TRANSPORT';
        // Retain only allowlisted codes; cause/message can contain URLs, keys or customer data.
        throw new Error(`${path} transport failed (${reason}; attempt ${attempt})`);
      }
      if (!response.ok) {
        // Response bodies can contain provider diagnostics or private data.
        await response.body?.cancel();
        throw new Error(`${path} failed with HTTP ${response.status}`);
      }
      try {
        return await response.json();
      } catch {
        throw new Error(`${path} returned an incomplete or invalid response`);
      }
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}
