import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  auth: vi.fn(),
  edit: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ requireArea: mock.auth }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: mock.revalidate }));
vi.mock('@/lib/domain/schedule/edit-upcoming', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  editUpcomingClasses: mock.edit,
}));
import { editUpcomingClassesAction } from '@/app/(studio)/admin/classes/[templateId]/upcoming-actions';
import { UpcomingClassEditError } from '@/lib/domain/schedule/edit-upcoming';
beforeEach(() => {
  vi.clearAllMocks();
  mock.auth.mockResolvedValue({ id: 'admin' });
  mock.edit.mockResolvedValue(1);
});
function form() {
  const f = new FormData();
  f.set('templateId', 'format');
  f.append('occurrenceId', 'one');
  f.set('version:one', 'version');
  f.set('changeName', 'on');
  f.set('title', 'Renamed');
  f.set('startAt', '2000-01-01');
  f.set('capacity', '1');
  return f;
}
describe('upcoming edit server boundary', () => {
  it('requires admin access before any edit', async () => {
    mock.auth.mockRejectedValue(new Error('Denied'));
    await expect(editUpcomingClassesAction({}, form())).rejects.toThrow(
      'Denied',
    );
    expect(mock.auth).toHaveBeenCalledWith('admin');
    expect(mock.edit).not.toHaveBeenCalled();
  });
  it('whitelists opted-in fields, ignores forged timestamps and refreshes public/admin views', async () => {
    expect(await editUpcomingClassesAction({}, form())).toEqual({ saved: 1 });
    expect(mock.edit).toHaveBeenCalledWith(
      {},
      {
        actorId: 'admin',
        templateId: 'format',
        selected: [{ id: 'one', updatedAt: 'version' }],
        patch: { titleOverride: 'Renamed' },
      },
    );
    expect(mock.revalidate).toHaveBeenCalledWith('/schedule');
    expect(mock.revalidate).toHaveBeenCalledWith('/admin/classes/format');
  });
  it('explains conflicts without reporting success or invalidating cached views', async () => {
    mock.edit.mockRejectedValue(new UpcomingClassEditError('stale'));
    expect(await editUpcomingClassesAction({}, form())).toEqual({
      error: expect.stringContaining('changed while you were editing'),
    });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
});
