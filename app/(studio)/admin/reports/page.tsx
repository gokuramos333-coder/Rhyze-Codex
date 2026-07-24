import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';

export default async function ReportsPage() {
  const [nativeRevenue, sombleRevenue, attended, importedClients, failed] =
    await Promise.all([
      prisma.purchase.aggregate({
        where: { status: 'PAID' },
        _sum: { amountCents: true },
      }),
      prisma.sombleTransaction.aggregate({ _sum: { amountCents: true } }),
      prisma.attendanceRecord.count({ where: { status: 'ATTENDED' } }),
      prisma.sombleClientProfile.count(),
      prisma.purchase.count({ where: { status: 'FAILED' } }),
    ]);
  const metrics = [
    [
      'Somble transferred revenue',
      `$${((sombleRevenue._sum.amountCents ?? 0) / 100).toFixed(0)}`,
    ],
    [
      'Native Rhyze revenue',
      `$${((nativeRevenue._sum.amountCents ?? 0) / 100).toFixed(0)}`,
    ],
    ['Attendance', attended],
    ['Imported clients', importedClients],
    ['Failed payments', failed],
  ] as const;

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        Studio intelligence
      </p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">
        ENGAGEMENT + REPORTS
      </h1>
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map(([label, value]) => (
          <div
            key={label}
            className="border-t-4 border-rhyze-orange bg-white p-5"
          >
            <p className="text-xs font-black uppercase tracking-widest">
              {label}
            </p>
            <p className="mt-3 font-display text-5xl">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/api/admin/somble-export?type=transactions"
          className="border border-rhyze-black px-4 py-3 text-xs font-black uppercase tracking-widest"
        >
          Export Somble Sales CSV
        </Link>
        <Link
          href="/api/admin/somble-export?type=clients"
          className="border border-rhyze-black px-4 py-3 text-xs font-black uppercase tracking-widest"
        >
          Export Imported Clients CSV
        </Link>
        {['revenue', 'attendance', 'members'].map((report) => (
          <Link
            key={report}
            href={`/api/reports/${report}`}
            className="border border-rhyze-black px-4 py-3 text-xs font-black uppercase tracking-widest"
          >
            Export Native {report} CSV
          </Link>
        ))}
      </div>
    </>
  );
}
