import { runProtectedJob } from '../lib/run-protected-job';

export default async () => Response.json(await runProtectedJob('/api/jobs/email', undefined, { retryConnectFailures: true }));

export const config = { schedule: '*/5 * * * *' };
