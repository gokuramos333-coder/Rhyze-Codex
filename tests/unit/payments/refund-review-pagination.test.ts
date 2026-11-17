import { describe, it, expect, vi } from 'vitest';
import {
  financialQueueCursor,
  financialQueuePage,
} from '@/lib/payments/refund-review-queue';
describe('financial backlog keyset pagination', () => {
  it('retains microsecond precision and the tie-breaker ID', () => {
    const value = { at: '2026-11-13T03:00:00.123456Z', id: 'review-b' };
    expect(
      financialQueueCursor(
        Buffer.from(JSON.stringify(value)).toString('base64url'),
      ),
    ).toEqual(value);
  });
  it('rejects malformed cursors', () => {
    expect(() => financialQueueCursor('bad')).toThrow(/cursor/);
  });
  it('returns a next cursor without dropping the lookahead row', async () => {
    const rows = ['a', 'b', 'c'].map((id) => ({
      id,
      cursorAt: '2026-11-13T03:00:00.123456Z',
    }));
    const db: any = { $queryRaw: vi.fn(async () => rows) };
    const page = await financialQueuePage(db, 'reviews', { limit: 2 });
    expect(page.rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(financialQueueCursor(page.next!)).toEqual({
      at: rows[1].cursorAt,
      id: 'b',
    });
    const sql = db.$queryRaw.mock.calls[0][0];
    expect(sql.sql).toContain('"resolvedAt" IS NULL');
    expect(sql.sql).toContain('ORDER BY');
  });
});
