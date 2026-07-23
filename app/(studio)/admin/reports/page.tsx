import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';

export default async function ReportsPage() {
  const [revenue, attended, signups, failed] = await Promise.all([
    prisma.purchase.aggregate({ where: { status: 'PAID' }, _sum: { amountCents: true } }),
    prisma.attendanceRecord.count({ where: { status: 'ATTENDED' } }),
    prisma.user.count({ where: { role: 'MEMBER' } }),
    prisma.purchase.count({ where: { status: 'FAILED' } }),
  ]);
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Studio intelligence</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">REPORTS</h1>
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {[['Recorded revenue', `$${((revenue._sum.amountCents || 0)/100).toFixed(0)}`],['Attendance',attended],['Members',signups],['Failed payments',failed]].map(([label,value]) => <div key={label} className="border-t-4 border-rhyze-orange bg-white p-5"><p className="text-xs font-black uppercase tracking-widest">{label}</p><p className="mt-3 font-display text-5xl">{value}</p></div>)}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        {['revenue','attendance','members'].map((report) => <Link key={report} href={`/api/reports/${report}`} className="border border-rhyze-black px-4 py-3 text-xs font-black uppercase tracking-widest">Export {report} CSV</Link>)}
      </div>
    </>
  );
}
