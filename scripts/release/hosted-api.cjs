const SITE = 'e7002b82-50f2-4760-8a35-e4f9591bec4f';
const ACCOUNT = '69f4526a0c4cac514e1ada7f';
function rateLimitWait(headers, now = Date.now()) {
  const delays = [];
  for (const [key, epoch] of [
    ['retry-after', false],
    ['x-ratelimit-reset', true],
  ]) {
    const raw = headers?.get(key);
    if (!raw) continue;
    const number = Number(raw);
    const delay = Number.isFinite(number)
      ? epoch || number > 1e9
        ? number * 1000 - now
        : number * 1000
      : Date.parse(raw) - now;
    if (Number.isFinite(delay)) delays.push(delay);
  }
  return Math.max(1000, ...(delays.length ? delays : [60000]));
}
// Deliberately no SDK/network retries for mutations: a timeout may follow an
// accepted publication. Only official fixed-origin endpoints are reachable.
async function requestNetlify(operation, data, token, fetcher = fetch) {
  try {
    if (
      !token ||
      (data.site_id && data.site_id !== SITE) ||
      (data.account_id && data.account_id !== ACCOUNT)
    )
      throw Error();
    const id = encodeURIComponent(data.deploy_id || '');
    const envPath = `/accounts/${ACCOUNT}/env`;
    const routes = {
      getSite: ['GET', `/sites/${SITE}`],
      getDeploy: ['GET', `/deploys/${id}`],
      getEnvVars: ['GET', `${envPath}?site_id=${SITE}`],
      getSiteDatabase: ['GET', `/sites/${SITE}/database?role=netlifydb_owner`],
      createEnvVars: ['POST', `${envPath}?site_id=${SITE}`, data.body],
      deleteEnvVar: [
        'DELETE',
        `${envPath}/${encodeURIComponent(data.key || '')}?site_id=${SITE}`,
      ],
      createSiteBuild: [
        'POST',
        `/sites/${SITE}/builds?${new URLSearchParams({ branch: data.branch || '', title: data.title || '' })}`,
      ],
      restoreSiteDeploy: ['POST', `/sites/${SITE}/deploys/${id}/restore`],
      lockDeploy: ['POST', `/deploys/${id}/lock`],
    };
    const route = routes[operation];
    if (!route) throw Error();
    const [method, path, body] = route;
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetcher(`https://api.netlify.com/api/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(90000),
      });
      if (response.status === 429 && method === 'GET' && attempt < 3) {
        const wait = rateLimitWait(response.headers);
        await response.body?.cancel();
        // Never ignore a reset further away than this bounded release wait.
        if (wait > 120000) throw Error();
        console.info(
          `Netlify ${operation} throttled; waiting ${Math.ceil(wait / 1000)}s before read-only retry ${attempt + 1}/3.`,
        );
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
      if (!response.ok) throw Error();
      const text = await response.text();
      return text ? JSON.parse(text) : undefined;
    }
    throw Error();
  } catch {
    throw Error(
      `Netlify ${operation} failed; inspect provider state before retrying. Sensitive output withheld.`,
    );
  }
}
module.exports = { requestNetlify };
