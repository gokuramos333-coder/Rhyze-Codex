import { runProtectedJob } from '../lib/run-protected-job';
// The route gates 9 AM America/New_York, including daylight-saving changes.
export default async () =>
  Response.json(await runProtectedJob('/api/jobs/member-absence'));
export const config = { schedule: '0 * * * *' };
