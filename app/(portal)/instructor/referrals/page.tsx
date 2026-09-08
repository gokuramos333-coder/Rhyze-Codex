import Link from 'next/link';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { earningsDateRange, type EarningsPeriod } from '@/lib/domain/referrals/earnings-periods';
import { ReferralCodeCard } from '@/components/referrals/ReferralCodeCard';

const periods: EarningsPeriod[] = ['week', 'biweek', 'month', 'custom'];

export default async function InstructorReferralsPage(
  props: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }
) {
  const searchParams = await props.searchParams;
  const user = await requireArea('instructor');
  const period = periods.includes(searchParams.period as EarningsPeriod) ? searchParams.period as EarningsPeriod : 'week';
  const range = earningsDateRange(period, new Date(), searchParams.from, searchParams.to);
  const [code, commissions, attributedCount] = await Promise.all([
    prisma.referralCode.findFirst({ where: { instructorId: user.id, isActive: true } }),
    prisma.referralCommission.findMany({
      where: {
        instructorId: user.id,
        ...(range.start || range.end
          ? { earnedAt: { gte: range.start || undefined, lte: range.end || undefined } }
          : {}),
      },
      include: { referredUser: true, purchase: { include: { product: true } } },
      orderBy: { earnedAt: 'desc' },
    }),
    prisma.referralAttribution.count({ where: { referralCode: { instructorId: user.id } } }),
  ]);
  const availableForPayout = commissions
    .filter((item) => item.status === 'EARNED')
    .reduce((sum, item) => sum + item.amountCents, 0);
  const paid = commissions
    .filter((item) => item.status === 'PAID')
    .reduce((sum, item) => sum + item.amountCents, 0);
  const generated = availableForPayout + paid;
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Growth & commission</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">MY REFERRALS</h1>
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {code ? <ReferralCodeCard code={code.code} origin={process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/> : <p className="bg-white p-6">Referral code is awaiting admin approval.</p>}
        <section className="border-t-4 border-rhyze-gold bg-white p-6"><p className="text-xs font-black uppercase tracking-widest">Available for payout · {period}</p><p className="mt-3 font-display text-6xl">${(availableForPayout/100).toFixed(2)}</p><p className="mt-2 text-sm text-rhyze-black/55">Paid ${(paid/100).toFixed(2)} · Total generated ${(generated/100).toFixed(2)} · {attributedCount} referred customers</p></section>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {[
          ['week', 'Weekly'],
          ['biweek', 'Bi-weekly'],
          ['month', 'Monthly'],
        ].map(([value, label]) => <Link key={value} href={`/instructor/referrals?period=${value}`} className={`px-4 py-2 text-xs font-black uppercase tracking-widest ${value === period ? 'bg-rhyze-black text-white' : 'border border-rhyze-black'}`}>{label}</Link>)}
      </div>
      <form className="mt-4 grid gap-3 border border-rhyze-orange/30 bg-orange-50 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="period" value="custom" />
        <label className="grid gap-1 text-xs font-black uppercase">From date<input type="date" name="from" defaultValue={searchParams.from} required className="min-h-11 border bg-white px-3 text-sm font-normal" /></label>
        <label className="grid gap-1 text-xs font-black uppercase">To date<input type="date" name="to" defaultValue={searchParams.to} required className="min-h-11 border bg-white px-3 text-sm font-normal" /></label>
        <button className="min-h-11 bg-rhyze-black px-5 text-xs font-black uppercase text-white">Apply dates</button>
      </form>
      <div className="mt-6 overflow-x-auto bg-white"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-4">Referred customer</th><th>Purchase</th><th>Commission</th><th>Status</th><th>Date</th></tr></thead><tbody>{commissions.map((item) => <tr key={item.id} className="border-b border-black/5"><td className="p-4">{item.referredUser.name || item.referredUser.email}</td><td>{item.purchase.product.name}</td><td>${(item.amountCents/100).toFixed(2)}</td><td>{item.status}</td><td>{item.earnedAt.toLocaleDateString()}</td></tr>)}</tbody></table>{commissions.length === 0 && <p className="p-8 text-rhyze-black/55">No qualifying referral earnings in this period.</p>}</div>
    </>
  );
}
