import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  classTemplate: { findMany: query },
  classCategory: { findMany: vi.fn().mockResolvedValue([]) },
  user: { findMany: vi.fn().mockResolvedValue([]) },
  sombleTransaction: { findMany: vi.fn().mockResolvedValue([]) },
  purchase: { findMany: vi.fn().mockResolvedValue([]) },
  booking: { findMany: vi.fn().mockResolvedValue([]) },
  classOccurrence: { findMany: vi.fn().mockResolvedValue([]) },
} }));
vi.mock('@/app/(studio)/admin/classes/actions', () => ({ archiveClassTemplateAction: vi.fn(), createClassTemplateAction: vi.fn(), deleteClassTemplateAction: vi.fn() }));
vi.mock('@/components/admin/AdminClassesCalendar', () => ({ AdminClassesCalendar: () => null }));
vi.mock('@/components/admin/AnalyticsCharts', () => ({ DistributionBars: () => null, RevenueAreaChart: () => null }));
import AdminClassesPage from '@/app/(studio)/admin/classes/page';
describe('admin next class query regression', () => {
  beforeEach(() => { query.mockResolvedValue([]); });
  it('filters out elapsed and archived rows before taking the next scheduled date', async () => {
    const before = new Date();
    await AdminClassesPage({ searchParams: Promise.resolve({}) });
    const options = query.mock.calls[0][0].include.occurrences;
    expect(options.take).toBe(1);
    expect(options.orderBy).toEqual({ startAt: 'asc' });
    expect(options.where).toMatchObject({ status: 'SCHEDULED', archivedAt: null, startAt: { gte: expect.any(Date) } });
    expect(+options.where.startAt.gte).toBeGreaterThanOrEqual(+before);
    expect(+options.where.startAt.gte).toBeLessThanOrEqual(Date.now());
  });
});
