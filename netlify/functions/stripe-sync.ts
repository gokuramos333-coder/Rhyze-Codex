import { runProtectedJob } from '../lib/run-protected-job';

export default async () => {
  // The protected route also reconciles provider-confirmed unpaid event checkouts.
  const stripe = await runProtectedJob('/api/jobs/stripe-sync', undefined, { retryConnectFailures: true });
  console.log('stripe-sync result', JSON.stringify(stripe));
  return Response.json({ stripe });
};

export const config = { schedule: '7 * * * *' };
