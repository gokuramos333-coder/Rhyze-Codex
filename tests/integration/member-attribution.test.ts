import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  attributionFromCookie,
  sourceAttributionSelect,
} from '@/lib/attribution/first-touch';
import {
  createAccount,
  AccountConflictError,
} from '@/lib/domain/accounts/account-service';
import { prismaAccountRepository } from '@/lib/domain/accounts/prisma-account-repository';
import { prisma } from '@/lib/db/prisma';

vi.mock('@/lib/db/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return {
    prisma: new PrismaClient({
      datasourceUrl: process.env.IDENTITY_TEST_DATABASE_URL,
    }),
  };
});

const url = process.env.IDENTITY_TEST_DATABASE_URL;
if (
  url &&
  (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) ||
    new URL(url).pathname !== '/identity_migration')
) {
  throw new Error(
    'Attribution integration requires the disposable local identity_migration database',
  );
}
describe.skipIf(!url)('first-touch member persistence on PostgreSQL', () => {
  const prefix = `attribution-test-${randomUUID()}`;
  const email = `${prefix}@example.test`;
  const waiverId = `${prefix}-waiver`;
  const accountInput = {
    name: 'Synthetic Attribution Test',
    email,
    phone: '9735550100',
    dateOfBirth: new Date('1990-01-01'),
    password: 'SyntheticTestOnly1!',
    waiverAccepted: true,
    waiverVersionId: waiverId,
  };
  beforeAll(async () => {
    await prisma.waiverVersion.create({
      data: {
        id: waiverId,
        title: 'Synthetic test only',
        body: 'Not a legal waiver. Disposable test fixture.',
        version: randomInt(100_000, 2_000_000_000),
        isActive: false,
        effectiveAt: new Date(),
      },
    });
  });
  afterAll(async () => {
    await prisma.waiverAcceptance.deleteMany({
      where: { waiverVersionId: waiverId },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [email, `${prefix}-existing@example.test`] } },
    });
    await prisma.waiverVersion.deleteMany({ where: { id: waiverId } });
    await prisma.$disconnect();
  });
  it('saves first touch at signup and cannot overwrite it by attempting another signup', async () => {
    const sourceAttribution = attributionFromCookie(
      JSON.stringify({
        fbclid: 'abc123',
        utm_source: 'meta',
        utm_medium: 'paid_social',
        utm_campaign: 'test',
        landing_path: '/join',
        captured_at: '2026-09-22T00:00:00.000Z',
      }),
      'https://www.rhyzefitness.com',
    );
    const created = await createAccount(
      { ...accountInput, sourceAttribution },
      prismaAccountRepository,
    );
    const first = await prisma.user.findUniqueOrThrow({
      where: { id: created.id },
      select: sourceAttributionSelect,
    });
    expect(first).toEqual(sourceAttribution);
    await expect(
      createAccount(
        {
          ...accountInput,
          sourceAttribution: attributionFromCookie(
            undefined,
            'https://www.rhyzefitness.com',
          ),
        },
        prismaAccountRepository,
      ),
    ).rejects.toBeInstanceOf(AccountConflictError);
    expect(
      await prisma.user.findUnique({
        where: { id: created.id },
        select: sourceAttributionSelect,
      }),
    ).toEqual(first);
  });
  it('leaves existing or admin-created members without manufactured source data', async () => {
    const existing = await prisma.user.create({
      data: { email: `${prefix}-existing@example.test` },
    });
    expect(existing.source_label).toBeNull();
    expect(existing.source_captured_at).toBeNull();
  });
});
