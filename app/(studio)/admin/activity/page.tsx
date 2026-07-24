import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';

export default async function AdminActivityPage() {
  const [transactions, profiles] = await Promise.all([
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
  const items = [
    ...transactions.map((item) => ({
      id: `sale-${item.id}`,
      at: item.transferredAt,
      name: item.user.name || item.supporterName,
      detail: `${item.contentType} · $${(item.amountCents / 100).toFixed(2)} transferred`,
      href: '/admin/payments',
    })),
    ...profiles.map((item) => ({
      id: `join-${item.id}`,
      at: item.sourceJoinedAt,
      name: item.user.name || item.user.email,
      detail: `Joined through Somble · ${item.sourceStatus}`,
      href: `/admin/members?q=${encodeURIComponent(item.user.email)}`,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

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
