import { runProtectedJob } from '../lib/run-protected-job';

export default async () => {
  const stripe = await runProtectedJob('/api/jobs/stripe-sync');
  console.log('stripe-sync result', JSON.stringify(stripe));
  return Response.json({ stripe });
};

export const config = { schedule: '* * * * *' };
