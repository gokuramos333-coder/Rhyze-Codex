import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  settings: vi.fn(),
}));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.user },
    newsletterSettings: { findUnique: mocks.settings },
  },
}));
import { newsletterActor } from '@/lib/newsletters/access';
import { GET, POST } from '@/app/api/admin/newsletters/route';
import { POST as upload } from '@/app/api/admin/newsletters/assets/route';
import { GET as leads, POST as outreach } from '@/app/api/admin/leads/route';
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://127.0.0.1:4317');
  mocks.auth.mockResolvedValue({ user: { id: 'staff' } });
  mocks.user.mockReset();
  mocks.settings.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
describe('Newsletter and lead authorization', () => {
  for (const role of ['MEMBER', 'INSTRUCTOR', 'MANAGER'])
    it(`denies ${role} newsletter lists, analytics, exports and uploads`, async () => {
      mocks.user.mockResolvedValue({
        id: 'staff',
        role,
        status: 'ACTIVE',
        email: 'sample@example.test',
        name: 'Sample',
      });
      for (const query of [
        '',
        '?id=other-campaign&review=1',
        '?id=other-campaign&export=1',
      ])
        expect(
          (
            await GET(
              new Request(
                'http://127.0.0.1:4317/api/admin/newsletters' + query,
              ),
            )
          ).status,
        ).toBe(403);
      expect(
        (
          await POST(
            new Request('http://127.0.0.1:4317/api/admin/newsletters', {
              method: 'POST',
              headers: { origin: 'http://127.0.0.1:4317' },
              body: JSON.stringify({ action: 'cancel', id: 'other-campaign' }),
            }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await upload(
            new Request('http://127.0.0.1:4317/api/admin/newsletters/assets', {
              method: 'POST',
              headers: { origin: 'http://127.0.0.1:4317' },
            }),
          )
        ).status,
      ).toBe(403);
      expect(mocks.settings).not.toHaveBeenCalled();
    });
  it('does not trust a stale session role or inactive account', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'staff', role: 'OWNER' } });
    mocks.user.mockResolvedValue({
      id: 'staff',
      role: 'OWNER',
      status: 'SUSPENDED',
      email: 'automation-admin@rhyze.local',
    });
    expect(await newsletterActor()).toBeNull();
  });
  it('retains the approved-owner boundary', async () => {
    mocks.user.mockResolvedValue({
      id: 'staff',
      role: 'OWNER',
      status: 'ACTIVE',
      email: 'unapproved@example.test',
    });
    expect(await newsletterActor()).toBeNull();
    expect(await newsletterActor(true)).toBeNull();
  });
  it('allows active admins and limits managers to personal outreach', async () => {
    mocks.user.mockResolvedValue({
      id: 'staff',
      role: 'ADMIN',
      status: 'ACTIVE',
      email: 'admin@example.test',
    });
    expect(await newsletterActor()).not.toBeNull();
    mocks.user.mockResolvedValue({
      id: 'staff',
      role: 'MANAGER',
      status: 'ACTIVE',
      email: 'manager@example.test',
    });
    expect(await newsletterActor(true)).not.toBeNull();
    expect(await newsletterActor()).toBeNull();
  });
  it('denies anonymous reads and cross-origin writes', async () => {
    mocks.auth.mockResolvedValue(null);
    expect(
      (await GET(new Request('http://127.0.0.1:4317/api/admin/newsletters')))
        .status,
    ).toBe(403);
    expect(
      (await leads(new Request('http://127.0.0.1:4317/api/admin/leads')))
        .status,
    ).toBe(403);
    const request = new Request('http://127.0.0.1:4317/api/admin/newsletters', {
      method: 'POST',
      headers: { origin: 'https://other.example' },
      body: '{}',
    });
    expect((await POST(request)).status).toBe(403);
    expect((await outreach(request.clone())).status).toBe(403);
  });
});
