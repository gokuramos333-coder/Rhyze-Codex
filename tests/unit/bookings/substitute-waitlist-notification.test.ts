import { expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
const queue = vi.hoisted(() => vi.fn());
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: queue }));
import { notifyWaitlistOpening } from '@/lib/domain/bookings/waitlist';
it('queues substitute labels and the canonical occurrence URL when a waitlist place opens', async () => {
  const occurrence = { id: 'synthetic-substitute', status: 'SCHEDULED', startAt: new Date('2026-11-02T23:10Z'), capacity: 25,
    historicalSignupCount: 0, _count: { bookings: 0 }, titleOverride: 'Zumba', substituteInstructorName: 'Vincent',
    instructorId: 'canonical-melissa', instructor: { name: 'Melissa' }, template: { name: 'Rhyze Ritmo', slug: 'ritmo', isEvent: false } };
  const tx = { classOccurrence: { findUnique: async () => occurrence }, waitlistEntry: { findMany: async () => [
    { id: 'waiting', userId: 'synthetic-member', user: { email: 'synthetic@example.test', name: 'Synthetic' } },
  ] } };
  await notifyWaitlistOpening(tx as unknown as Prisma.TransactionClient, occurrence.id, 'synthetic-release', new Date('2026-11-01T17:00Z'));
  expect(queue).toHaveBeenCalledExactlyOnceWith(tx, expect.objectContaining({ subject: 'A spot opened for Zumba',
    template: 'WAITLIST_SPOT_AVAILABLE', payload: expect.objectContaining({ className: 'Zumba', instructorName: 'Vincent',
      occurrenceId: occurrence.id, claimUrl: '/book/ritmo?occurrence=synthetic-substitute' }),
    dedupeKey: 'waitlist-spot-available:synthetic-release:waiting' }));
  expect(occurrence.instructorId).toBe('canonical-melissa');
});
