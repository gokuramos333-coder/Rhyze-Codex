import { runProtectedJob } from '../lib/run-protected-job';

type ProtectedJobRunner = (path: string) => Promise<unknown>;

export async function runMembershipMaintenance(
  runJob: ProtectedJobRunner = runProtectedJob,
) {
  return runJob('/api/jobs/memberships');
}

export default async () => {
  const memberships = await runMembershipMaintenance();
  return Response.json(memberships);
};

export const config = { schedule: '15 * * * *' };
