import Link from 'next/link';
import { FinancialReportView } from '@/components/admin/FinancialReportView';
import {
  loadFinancialReport,
  type FinancialReportParams,
} from '@/lib/admin/financial-report';
export const dynamic = 'force-dynamic';
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<FinancialReportParams>;
}) {
  const report = await loadFinancialReport(await searchParams);
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        Studio intelligence
      </p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">REPORTS</h1>
      <FinancialReportView report={report} basePath="/admin/reports" />
      <div className="mt-8 flex gap-4">
        <Link href="/api/reports/attendance">Export all attendance</Link>
        <Link href="/api/reports/members">Export all members</Link>
      </div>
    </>
  );
}
