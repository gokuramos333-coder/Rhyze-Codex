import { specialEventIdentity } from '@/lib/payments/black-friday-new-friend';
import { paidEventDisplayCount } from '@/lib/payments/special-event-roster';

/** Display counts only. Checkout and waitlist eligibility use reservation-aware capacity. */
export async function paidEventDisplayCounts(occurrenceIds: Iterable<string>) {
  const ids = [...new Set(occurrenceIds)].filter((id) => specialEventIdentity(id));
  const counts = await Promise.all(ids.map(async (id) => [id, await paidEventDisplayCount(id)] as const));
  return new Map(counts);
}
