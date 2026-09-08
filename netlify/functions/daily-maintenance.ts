import { runProtectedJob } from '../lib/run-protected-job';

export default async () => {
  const [credentials, memberships, birthdays] = await Promise.all([
    runProtectedJob('/api/jobs/credentials'),
    runProtectedJob('/api/jobs/memberships'),
    runProtectedJob('/api/jobs/birthdays'),
  ]);
  return Response.json({ credentials, memberships, birthdays });
};

export const config = { schedule: '0 10 * * *' };
