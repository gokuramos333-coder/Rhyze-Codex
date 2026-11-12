import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  owner: vi.fn(),
  change: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ requireApprovedOwner: state.owner }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('next/cache', () => ({ revalidatePath: state.revalidate }));
vi.mock('@/lib/domain/accounts/client-archive', () => ({
  changeClientArchive: state.change,
  ClientArchiveError: class extends Error {},
}));
import { changeClientArchiveAction } from '@/app/(studio)/admin/members/[userId]/archive-actions';
beforeEach(() => {
  vi.resetAllMocks();
  state.owner.mockResolvedValue({ id: 'owner' });
});
function form(operation: string) {
  const f = new FormData();
  f.set('operation', operation);
  f.set('userId', 'client');
  return f;
}
it('rejects a delete request without invoking a service', async () => {
  expect((await changeClientArchiveAction(form('delete'))).ok).toBe(false);
  expect(state.change).not.toHaveBeenCalled();
});
it('requires owner authentication and uses the session actor', async () => {
  state.owner.mockRejectedValueOnce(new Error('not owner'));
  await expect(changeClientArchiveAction(form('archive'))).rejects.toThrow(
    'not owner',
  );
  expect(state.change).not.toHaveBeenCalled();
  const input = form('restore');
  input.set('actorId', 'forged');
  expect((await changeClientArchiveAction(input)).ok).toBe(true);
  expect(state.change).toHaveBeenCalledWith({}, 'owner', 'client', 'restore');
  expect(state.revalidate).toHaveBeenCalledWith('/admin/members');
  expect(state.revalidate).toHaveBeenCalledWith('/admin/members/client');
});
