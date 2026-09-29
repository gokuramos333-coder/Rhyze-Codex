import { beforeEach, describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { classOccurrence: db } }));
import { loadPublicScheduleSlots } from '@/lib/domain/schedule/public-schedule-query';
const from = new Date('2026-10-01T04:00:00Z');
function occurrence(index: number, isEvent = false) {
  return { id: `date-${index}`, startAt: new Date(from.getTime() + (index + 1) * 3600000), timezone: 'America/New_York',
    template: { slug: isEvent ? 'mommy' : 'dance', name: isEvent ? 'Mommy & Me' : 'Dance', isActive: true, archivedAt: null, isEvent, category: { name: 'Dance' }, durationMinutes: 50 },
    instructor: null, room: null, capacity: 20, historicalSignupCount: 0, priceCents: 3000, _count: { bookings: 0, waitlistEntries: 0 },
  };
}
beforeEach(() => vi.clearAllMocks());
describe('public schedule event eligibility', () => {
  it('keeps events reachable even after 180 earlier scheduled classes', async () => {
    const rows = [...Array.from({ length: 180 }, (_, i) => occurrence(i)), occurrence(180, true)];
    db.findMany.mockImplementation(async ({ take }) => take ? rows.slice(0, take) : rows);
    const slots = await loadPublicScheduleSlots(from);
    expect(slots).toHaveLength(181);
    expect(slots.at(-1)).toMatchObject({ isEvent: true, bookingHref: '/events/mommy?occurrence=date-180' });
  });
  it('retains future scheduled, active, non-archived restrictions without excluding event templates', async () => {
    db.findMany.mockResolvedValue([]);
    await loadPublicScheduleSlots(from);
    expect(db.findMany.mock.calls[0][0].where).toEqual({ status: 'SCHEDULED', startAt: { gte: from }, template: { isActive: true, archivedAt: null } });
  });
});
