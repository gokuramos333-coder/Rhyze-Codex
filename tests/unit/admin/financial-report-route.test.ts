import { describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  load: vi.fn(),
  rows: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ requireApprovedOwner: mocks.owner }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/admin/financial-report', () => ({
  loadFinancialReport: mocks.load,
  financialReportCsvRows: mocks.rows,
}));
import { GET } from '@/app/api/reports/[report]/route';
it('exports signed amounts as numbers while neutralizing spreadsheet formulas in customer text', async () => {
  mocks.load.mockResolvedValue({});
  mocks.rows.mockReturnValue([
    ['Customer', 'Net movement minor units'],
    ['=HYPERLINK("bad")', -117],
  ]);
  const response = await GET(
    new Request(
      'https://rhyze.test/api/reports/revenue?range=custom&from=2026-08-01&to=2026-08-31',
    ),
    { params: Promise.resolve({ report: 'revenue' }) },
  );
  const text = await response.text();
  expect(text).toContain(',-117');
  expect(text).not.toContain("'-117");
  expect(text).toContain("'=HYPERLINK");
  expect(mocks.owner).toHaveBeenCalled();
  expect(mocks.load).toHaveBeenCalledWith({
    range: 'custom',
    from: '2026-08-01',
    to: '2026-08-31',
  });
});
