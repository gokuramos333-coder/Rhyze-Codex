import { runProtectedJob } from '../lib/run-protected-job';

export default async () =>
  Response.json(await runProtectedJob('/api/jobs/low-attendance-cancellations'));

export const config = { schedule: '* * * * *' };
