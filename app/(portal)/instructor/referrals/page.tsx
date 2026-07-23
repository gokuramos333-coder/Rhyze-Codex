import Link from 'next/link';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { earningsPeriodStart, type EarningsPeriod } from '@/lib/domain/referrals/earnings-periods';
import { ReferralCodeCard } from '@/components/referrals/ReferralCodeCard';

const periods: EarningsPeriod[] = ['week','month','year','lifetime'];

export default async function InstructorReferralsPage({ searchParams }: { searchParams: { period?: string } }) {
  const user = await requireArea('instructor');
  const period = periods.includes(searchParams.period as EarningsPeriod) ? searchParams.period as EarningsPeriod : 'month';
  const start = earningsPeriodStart(period);
  const [code, commissions, attributedCount] = await Promise.all([
    prisma.referralCode.findFirst({ where: { instructorId: user.id, isActive: true } }),
    prisma.referralCommission.findMany({
      where: { instructorId: user.id, ...(start ? { earnedAt: { gte: start } } : {}) },
      include: { referredUser: true, purchase: { include: { product: true } } },
      orderBy: { earnedAt: 'desc' },
    }),
    prisma.referralAttribution.count({ where: { referralCode: { instructorId: user.id } } }),
  ]);
  const earned = commissions.filter((item) => item.status === 'EARNED' || item.status === 'PAID').reduce((sum, item) => sum + item.amountCents, 0);
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Growth & commission</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">MY REFERRALS</h1>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {code ? <ReferralCodeCard code={code.code} origin={process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/> : <p className="bg-white p-6">Referral code is awaiting admin approval.</p>}
        <section className="border-t-4 border-rhyze-gold bg-white p-6"><p className="text-xs font-black uppercase tracking-widest">Earnings · {period}</p><p className="mt-3 font-display text-6xl">${(earned/100).toFixed(2)}</p><p className="mt-2 text-sm text-rhyze-black/55">{attributedCount} referred customers · {commissions.length} qualifying purchases</p></section>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">{periods.map((item) => <Link key={item} href={`/instructor/referrals?period=${item}`} className={`px-4 py-2 text-xs font-black uppercase tracking-widest ${item === period ? 'bg-rhyze-black text-white' : 'border border-rhyze-black'}`}>{item}</Link>)}</div>
      <div className="mt-6 overflow-x-auto bg-white"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-4">Referred customer</th><th>Purchase</th><th>Commission</th><th>Status</th><th>Date</th></tr></thead><tbody>{commissions.map((item) => <tr key={item.id} className="border-b border-black/5"><td className="p-4">{item.referredUser.name || item.referredUser.email}</td><td>{item.purchase.product.name}</td><td>${(item.amountCents/100).toFixed(2)}</td><td>{item.status}</td><td>{item.earnedAt.toLocaleDateString()}</td></tr>)}</tbody></table>{commissions.length === 0 && <p className="p-8 text-rhyze-black/55">No qualifying referral earnings in this period.</p>}</div>
    </>
  );
}
