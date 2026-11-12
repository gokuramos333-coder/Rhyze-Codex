import { describe, expect, it, vi } from 'vitest';
import {
  changeClientArchive,
  getClientArchive,
  clientArchiveVisibilityWhere,
} from '@/lib/domain/accounts/client-archive';
import type { PrismaClient } from '@prisma/client';
function fixture(reasons: string[] = [], archived = false) {
  const target = {
    id: 'client',
    role: 'MEMBER',
    archivedAt: archived ? new Date() : null,
  };
  const actor = {
    id: 'owner',
    role: 'OWNER',
    status: 'ACTIVE',
    email: 'automation-admin@rhyze.local',
  };
  const tx = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'owner' ? actor : target,
      ),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(async () => [
      { id: 'client', archivedAt: target.archivedAt, reasons },
    ]),
  };
  return {
    actor,
    target,
    tx,
    db: {
      ...tx,
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    } as unknown as PrismaClient,
  };
}
describe('client archive service', () => {
  it('writes only archive visibility and an audit entry', async () => {
    const { db, tx } = fixture();
    await changeClientArchive(db, 'owner', 'client', 'archive');
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'client' },
      data: { archivedAt: expect.any(Date) },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'client.directory.archived' }),
      }),
    );
  });
  it('blocks obligations even for an already marked archive', async () => {
    const { db, tx } = fixture(['Active billing or unresolved payment'], true);
    await expect(
      changeClientArchive(db, 'owner', 'client', 'archive'),
    ).rejects.toThrow('billing');
    expect(tx.user.update).not.toHaveBeenCalled();
    await changeClientArchive(db, 'owner', 'client', 'restore');
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'client' },
      data: { archivedAt: null },
    });
  });
  it('checks current owner authority and rejects deletion', async () => {
    const { db, tx, actor } = fixture();
    actor.status = 'SUSPENDED';
    await expect(
      changeClientArchive(db, 'owner', 'client', 'archive'),
    ).rejects.toThrow('Not authorized');
    await expect(
      changeClientArchive(db, 'owner', 'client', 'delete' as 'archive'),
    ).rejects.toThrow('Invalid');
    expect(tx.user.update).not.toHaveBeenCalled();
  });
  it('is idempotent and exposes effective reappearance', async () => {
    const { db, tx } = fixture([], true);
    await changeClientArchive(db, 'owner', 'client', 'archive');
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(await getClientArchive(db, 'client')).toMatchObject({
      archived: true,
      effectivelyArchived: true,
    });
    const blocked = fixture(['Credits or access obligations'], true);
    expect(await getClientArchive(blocked.db, 'client')).toMatchObject({
      archived: true,
      effectivelyArchived: false,
    });
  });
  it('applies visibility without overriding existing directory filters', async () => {
    const { db } = fixture();
    expect(await clientArchiveVisibilityWhere(db, 'archived')).toEqual({
      id: { in: ['client'] },
    });
    expect(await clientArchiveVisibilityWhere(db, '')).toEqual({
      id: { notIn: ['client'] },
    });
    expect(await clientArchiveVisibilityWhere(db, 'all')).toEqual({});
  });
});
