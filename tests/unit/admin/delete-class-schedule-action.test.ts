import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ requireArea: mocks.auth }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.refresh }));
vi.mock('@/lib/domain/schedule/delete-occurrence', () => ({
  deleteClassSchedule: mocks.remove,
  DeleteOccurrenceError: class extends Error {
    constructor(public code: string) {
      super(code);
    }
  },
}));
import { deleteClassScheduleAction } from '@/app/(studio)/admin/classes/[templateId]/delete-actions';
import { DeleteOccurrenceError } from '@/lib/domain/schedule/delete-occurrence';
const dates = [
  {
    id: 'date',
    expectedStartAt: 'start',
    expectedUpdatedAt: 'version',
    booked: 0,
    waiting: 0,
  },
];
function form() {
  const f = new FormData();
  f.set('templateId', 'format');
  f.set('scope', 'future');
  f.set('dates', JSON.stringify(dates));
  f.set('confirmDelete', 'yes');
  return f;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ id: 'owner' });
  mocks.remove.mockResolvedValue({ removed: 1, alreadyRemoved: 0 });
});
describe('schedule deletion server action', () => {
  it('checks permissions before any parsing or write', async () => {
    mocks.auth.mockRejectedValue(new Error('Denied'));
    await expect(deleteClassScheduleAction({}, form())).rejects.toThrow(
      'Denied',
    );
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('validates scope and payload', async () => {
    const f = form();
    f.set('scope', 'anything');
    expect(await deleteClassScheduleAction({}, f)).toHaveProperty('error');
    f.set('dates', 'not-json');
    expect(await deleteClassScheduleAction({}, f)).toHaveProperty('error');
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('passes the reviewed snapshot and refreshes customer/admin/member views only on success', async () => {
    expect(await deleteClassScheduleAction({}, form())).toMatchObject({
      removed: 1,
      completedAt: expect.any(String),
    });
    expect(mocks.remove).toHaveBeenCalledWith({}, 'owner', {
      templateId: 'format',
      scope: 'future',
      dates,
      confirmed: true,
    });
    for (const path of [
      '/schedule',
      '/admin/classes/format',
      '/member/bookings',
    ])
      expect(mocks.refresh).toHaveBeenCalledWith(path);
  });
  it('explains blocked payments and does not claim success', async () => {
    mocks.remove.mockRejectedValue(new DeleteOccurrenceError('delete-payment'));
    expect(await deleteClassScheduleAction({}, form())).toEqual({
      error: expect.stringContaining('Nothing was removed'),
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
