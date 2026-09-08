import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { buildAdminActivityItems } from '@/lib/admin/activity-client-metrics';

export default async function AdminActivityPage() {
  const [users, purchases, memberships, commerceOrders, transactions, profiles] = await Promise.all([
    prisma.user.findMany({
      where: { NOT: { email: { endsWith: '@rhyze.local' } } },
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.purchase.findMany({
      where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
      include: { user: true, product: true, refunds: true },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    }),
    prisma.membership.findMany({
      include: { user: true, product: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.commerceOrder.findMany({
      where: { status: { in: ['PAID', 'FULFILLMENT_REVIEW', 'REFUNDED'] } },
      include: { user: true, items: true },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    }),
    prisma.sombleTransaction.findMany({
      include: { user: true },
      orderBy: { transferredAt: 'desc' },
      take: 100,
    }),
    prisma.sombleClientProfile.findMany({
      include: { user: true },
      orderBy: { sourceJoinedAt: 'desc' },
      take: 100,
    }),
  ]);
  const items = buildAdminActivityItems({
    users,
    purchases,
    memberships,
    commerceOrders,
    sombleTransactions: transactions,
    sombleProfiles: profiles,
  }).slice(0, 200);

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Community pulse</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">ACTIVITY</h1>
      <div className="mt-8 max-w-5xl bg-white">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="grid gap-2 border-b border-black/5 p-5 hover:bg-rhyze-gold/10 md:grid-cols-[1fr_auto]"
          >
            <span>
              <strong className="block">{item.name}</strong>
              <small className="text-rhyze-black/50">{item.detail}</small>
            </span>
            <time className="text-xs font-bold text-rhyze-black/40">
              {item.at.toLocaleString('en-US', { timeZone: 'America/New_York' })}
            </time>
          </Link>
        ))}
      </div>
    </>
  );
}
