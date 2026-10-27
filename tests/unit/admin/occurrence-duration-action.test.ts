import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireArea: vi.fn(), requireAssignableInstructor: vi.fn(),
  findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), audit: vi.fn(), transaction: vi.fn(), lock: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ requireArea: mocks.requireArea }));
vi.mock('@/lib/domain/instructors/assignment', () => ({ requireAssignableInstructor: mocks.requireAssignableInstructor }));
vi.mock('@/lib/notifications/email-queue', () => ({ queueEmail: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(url); } }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  classOccurrence: { findUnique: mocks.findUnique }, $transaction: mocks.transaction,
} }));
import { updateOccurrenceAction } from '@/app/(studio)/admin/schedule/[occurrenceId]/actions';

const current = () => ({
  id: 'pound-november', templateId: 'pound', template: { durationMinutes: 30 },
  startAt: new Date('2026-11-01T15:00:00Z'), endAt: new Date('2026-11-01T15:30:00Z'),
  timezone: 'America/New_York', status: 'SCHEDULED', instructorId: 'mackenzie', roomId: 'studio',
  capacity: 25, priceCents: 1500,
});
function form(duration: string | null = '50') {
  const data = new FormData();
  Object.entries({ id: 'pound-november', startAt: '2026-11-01T10:00', instructorId: 'mackenzie', capacity: '25', dropInPrice: '20' }).forEach(([key, value]) => data.set(key, value));
  if (duration !== null) data.set('durationMinutes', duration);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireArea.mockResolvedValue({ id: 'owner' });
  mocks.findUnique.mockResolvedValue(current());
  mocks.findMany.mockResolvedValue([]);
  mocks.transaction.mockImplementation(async (run) => run({
    classOccurrence: { findUnique: mocks.findUnique, findMany: mocks.findMany, update: mocks.update },
    auditLog: { create: mocks.audit }, $executeRaw: mocks.lock,
  }));
});
describe('occurrence-local duration edit', () => {
  it('saves 50 minutes / $20 on only the selected occurrence with before/after audit', async () => {
    await expect(updateOccurrenceAction(form())).rejects.toThrow('?saved=1');
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id: 'pound-november' }, data: expect.objectContaining({ startAt: new Date('2026-11-01T15:00:00Z'), endAt: new Date('2026-11-01T15:50:00Z'), priceCents: 2000, roomId: 'studio', capacity: 25 }) });
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: 'owner', entityId: 'pound-november', action: 'class-occurrence.updated.by-admin', before: expect.objectContaining({ endAt: current().endAt, priceCents: 1500 }), after: expect.objectContaining({ endAt: new Date('2026-11-01T15:50:00Z'), priceCents: 2000 }) }) });
  });
  it('preserves the stored override for a legacy form omitting duration', async () => {
    mocks.findUnique.mockResolvedValue({ ...current(), endAt: new Date('2026-11-01T15:50:00Z') });
    await expect(updateOccurrenceAction(form(null))).rejects.toThrow('?saved=1');
    expect(mocks.update.mock.calls[0][0].data.endAt.toISOString()).toBe('2026-11-01T15:50:00.000Z');
  });
  it('retains an ordinary 30-minute occurrence default when duration is omitted', async () => {
    await expect(updateOccurrenceAction(form(null))).rejects.toThrow('?saved=1');
    expect(mocks.update.mock.calls[0][0].data.endAt).toEqual(current().endAt);
  });
  it.each(['', '0', '-1', '4', '481', '50.5', 'NaN', 'Infinity', 'abc'])('rejects invalid explicit duration %j without mutation or audit', async duration => {
    await expect(updateOccurrenceAction(form(duration))).rejects.toThrow('?error=duration');
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('checks the extended interval against scheduled room/instructor conflicts excluding itself', async () => {
    mocks.findMany.mockResolvedValue([{ startAt: new Date('2026-11-01T15:40:00Z'), endAt: new Date('2026-11-01T16:30:00Z') }]);
    await expect(updateOccurrenceAction(form())).rejects.toThrow('?error=conflict');
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { not: 'pound-november' }, status: 'SCHEDULED', OR: [{ roomId: 'studio' }, { instructorId: 'mackenzie' }] }) }));
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('allows back-to-back intervals', async () => {
    mocks.findMany.mockResolvedValue([{ startAt: new Date('2026-11-01T15:50:00Z'), endAt: new Date('2026-11-01T16:30:00Z') }]);
    await expect(updateOccurrenceAction(form())).rejects.toThrow('?saved=1');
  });
  it('fails closed on unauthorized requests before reads or writes', async () => {
    mocks.requireArea.mockRejectedValue(new Error('denied'));
    await expect(updateOccurrenceAction(form())).rejects.toThrow('denied');
    expect(mocks.requireArea).toHaveBeenCalledWith('admin');
    expect(mocks.findUnique).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('keeps conflict read and audited write in a serializable transaction sharing the import lock', async () => {
    await expect(updateOccurrenceAction(form())).rejects.toThrow('?saved=1');
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
    expect(mocks.lock).toHaveBeenCalled();
  });
  it('exposes bounded occurrence duration initialized from stored dates, not template duration', () => {
    const page = readFileSync('app/(studio)/admin/schedule/[occurrenceId]/page.tsx', 'utf8');
    expect(page).toContain('name="durationMinutes"');
    expect(page).toContain('(item.endAt.getTime() - item.startAt.getTime()) / 60_000');
    expect(page).toContain('min="5" max="480" step="1"');
    expect(page).toContain("searchParams.error === 'conflict'");
  });
});
