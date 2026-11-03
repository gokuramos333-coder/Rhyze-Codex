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
    expect(await editUpcomingClassesAction({}, form())).toEqual({
      saved: 1,
      savedAt: expect.any(String),
    });
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
  it('passes exact selected times and explicit new dates through the guarded service', async () => {
    const f = form();
    f.set('start:one', '2026-11-10T19:10');
    f.append('newStartAt', '2026-11-17T19:10');
    f.append('newStartAt', '2026-11-24T19:10');
    f.set('sourceId', 'one');
    await editUpcomingClassesAction({}, f);
    expect(mock.edit).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        selected: [
          { id: 'one', updatedAt: 'version', startLocal: '2026-11-10T19:10' },
        ],
        newStarts: ['2026-11-17T19:10', '2026-11-24T19:10'],
        sourceId: 'one',
      }),
    );
  });
  it('explains conflicts without reporting success or invalidating cached views', async () => {
    mock.edit.mockRejectedValue(new UpcomingClassEditError('stale'));
    expect(await editUpcomingClassesAction({}, form())).toEqual({
      error: expect.stringContaining('changed while you were editing'),
    });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
});
