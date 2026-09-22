import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { productionDatabaseUrl, readProductionDataHealth } from '@/lib/automation/production-data-health';

describe('production-only read-only telemetry', () => {
  it.each([
    {}, { target: 'local', database: { connectionString: 'postgresql://user:secret@db.example/prod' } },
    { target: 'production', database: { connectionString: 'postgresql://user:secret@localhost/prod' } },
    { target: 'production', database: { connectionString: 'postgresql://user:secret@127.0.0.1/prod' } },
    { target: 'production', database: { connectionString: 'invalid-secret-string' } },
  ])('rejects unverified or local configuration without disclosing it', (config) => {
    expect(() => productionDatabaseUrl(config)).toThrow(/^A remote production read-only database configuration is required\.$/);
  });
  it('uses the explicitly selected production connection', () => {
    const url = 'postgresql://readonly:secret@db.example/prod?sslmode=require';
    expect(productionDatabaseUrl({ target: 'production', database: { connectionString: url } })).toBe(url);
  });

  function client(readOnlyError?: Error) {
    let readOnly = false;
    const count = vi.fn(async () => { if (!readOnly) throw new Error('read before read-only guard'); return 2; });
    const findMany = vi.fn(async () => { if (!readOnly) throw new Error('read before read-only guard'); return []; });
    const tx = {
      $executeRawUnsafe: vi.fn(async () => { if (readOnlyError) throw readOnlyError; readOnly = true; }),
      classOccurrence: { count: vi.fn(count) }, booking: { count: vi.fn(count) }, paymentRecord: { count: vi.fn(count) },
      purchase: { count: vi.fn(count), findMany }, commerceOrder: { count: vi.fn(count), findMany },
      emailMessage: { count: vi.fn(count) }, stripeEvent: { count: vi.fn(count) },
      sombleClientProfile: { count: vi.fn(count) }, membership: { count: vi.fn(count) },
    };
    const db = { $transaction: vi.fn(async (fn) => fn(tx)) };
    return { db: db as unknown as PrismaClient, tx, count };
  }
  it('enforces read-only before every aggregate and labels the actual source', async () => {
    const { db, tx } = client();
    const now = new Date('2026-09-21T16:00:00Z');
    const result = await readProductionDataHealth(db, now);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledExactlyOnceWith('SET TRANSACTION READ ONLY');
    expect(result).toMatchObject({ source: 'production-readonly', checkedAt: now.toISOString(), upcomingOccurrences: 2 });
    expect(result).not.toHaveProperty('databaseUrl');
  });
  it('fails closed if read-only transaction setup fails', async () => {
    const { db, count } = client(new Error('read-only setup failed'));
    await expect(readProductionDataHealth(db)).rejects.toThrow('read-only setup failed');
    expect(count).not.toHaveBeenCalled();
  });
  it('checks status updates and outstanding disputes, not just when the purchase was made', async () => {
    const { db, tx } = client();
    await readProductionDataHealth(db, new Date('2026-09-21T16:00:00Z'));
    // A July purchase disputed today must not disappear behind a createdAt/occurredAt filter.
    expect(tx.paymentRecord.count).toHaveBeenCalledWith({ where: {
      updatedAt: { gte: new Date('2026-09-14T16:00:00Z') }, status: { in: ['FAILED', 'DISPUTED'] },
    } });
    expect(tx.paymentRecord.count).toHaveBeenCalledWith({ where: { status: 'DISPUTED' } });
    expect(tx.purchase.count).toHaveBeenCalledWith({ where: {
      updatedAt: { gte: new Date('2026-09-14T16:00:00Z') }, status: 'FAILED',
    } });
    expect(tx.stripeEvent.count).toHaveBeenCalledWith({ where: { processedAt: null, error: { not: null } } });
  });
});
