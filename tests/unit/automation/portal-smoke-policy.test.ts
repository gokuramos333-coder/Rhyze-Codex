import { describe, expect, it, vi } from 'vitest';
import { verifyPortalAccess } from '@/lib/automation/portal-smoke-policy';

describe('approved portal access smoke policy', () => {
  it('requires owners to access instructor and admin areas', async () => {
    const open = vi.fn(); const deny = vi.fn();
    await verifyPortalAccess('OWNER', { open, deny });
    expect(open).toHaveBeenCalledWith('/instructor');
    expect(open).toHaveBeenCalledWith('/admin/settings');
    expect(open).toHaveBeenCalledWith('/member');
    expect(deny).not.toHaveBeenCalled();
  });
  it('allows instructors their portal but requires an admin denial', async () => {
    const open = vi.fn(); const deny = vi.fn();
    await verifyPortalAccess('INSTRUCTOR', { open, deny });
    expect(open).toHaveBeenCalledWith('/instructor');
    expect(open).toHaveBeenCalledWith('/member');
    expect(deny).toHaveBeenCalledExactlyOnceWith('/admin/settings');
  });
  it('requires member denial from both privileged areas', async () => {
    const open = vi.fn(); const deny = vi.fn();
    await verifyPortalAccess('MEMBER', { open, deny });
    expect(open).toHaveBeenCalledWith('/member/bookings');
    expect(deny.mock.calls).toEqual([['/admin/settings'], ['/instructor']]);
  });
  it('fails if a forbidden route becomes accessible', async () => {
    const deny = vi.fn().mockRejectedValue(new Error('unexpected HTTP 200'));
    await expect(verifyPortalAccess('MEMBER', { open: vi.fn(), deny })).rejects.toThrow('unexpected HTTP 200');
  });
});
