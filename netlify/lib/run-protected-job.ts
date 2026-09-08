const jobSecret = process.env.JOB_SECRET;

export async function runProtectedJob(path: string, body?: unknown) {
  const siteUrl = process.env.URL;
  if (!siteUrl || !jobSecret) {
    throw new Error('URL and JOB_SECRET are required for scheduled jobs.');
  }
  const response = await fetch(`${siteUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${jobSecret}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    throw new Error(`${path} failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}
