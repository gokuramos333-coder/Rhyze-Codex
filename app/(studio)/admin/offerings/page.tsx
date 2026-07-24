import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { ownedEvents } from '@/lib/rhyze-platform';
import { calculateSombleMetrics } from '@/lib/admin/somble-metrics';

export default async function AdminOfferingsPage() {
  const [products, classes, transactions] = await Promise.all([
    prisma.product.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.classTemplate.findMany({
      include: { _count: { select: { occurrences: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.sombleTransaction.findMany({
      select: { amountCents: true, contentType: true, userId: true },
    }),
  ]);
  const metrics = calculateSombleMetrics(transactions);

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Catalog performance</p>
          <h1 className="mt-3 font-display text-6xl tracking-wider">OFFERINGS</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/classes" className="bg-rhyze-gradient px-4 py-3 text-xs font-black uppercase">Add Class</Link>
          <Link href="/admin/products" className="bg-rhyze-black px-4 py-3 text-xs font-black uppercase text-white">Add Membership</Link>
        </div>
      </div>
      <div className="mt-7 grid gap-3 md:grid-cols-4">
        <Metric label="Transferred revenue" value={`$${(metrics.transferredRevenueCents / 100).toFixed(0)}`} />
        <Metric label="Active products" value={`${products.filter((item) => item.isActive).length}`} />
        <Metric label="Class templates" value={`${classes.length}`} />
        <Metric label="Public events" value={`${ownedEvents.length}`} />
      </div>
      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section className="bg-white p-5">
          <div className="flex items-center justify-between"><h2 className="font-display text-4xl tracking-wider">MEMBERSHIPS + PASSES</h2><Link href="/admin/products" className="text-xs font-black uppercase text-rhyze-coral">Manage</Link></div>
          <div className="mt-4 divide-y divide-black/10">
            {products.map((item) => (
              <Link href="/admin/products" key={item.id} className="flex items-center justify-between gap-4 py-4 hover:text-rhyze-coral">
                <span><strong className="block">{item.name}</strong><small>{item.kind.replaceAll('_', ' ')} · {item.isActive ? 'Active' : 'Inactive'}</small></span>
                <strong>${(item.priceCents / 100).toFixed(2)}</strong>
              </Link>
            ))}
          </div>
        </section>
        <section className="bg-white p-5">
          <div className="flex items-center justify-between"><h2 className="font-display text-4xl tracking-wider">CLASSES</h2><Link href="/admin/classes" className="text-xs font-black uppercase text-rhyze-coral">Manage</Link></div>
          <div className="mt-4 divide-y divide-black/10">
            {classes.map((item) => (
              <Link href={`/admin/classes/${item.id}`} key={item.id} className="flex items-center justify-between gap-4 py-4 hover:text-rhyze-coral">
                <span><strong className="block">{item.name}</strong><small>{item.durationMinutes} minutes · {item._count.occurrences} occurrences</small></span>
                <strong>{item.dropInPriceCents ? `$${(item.dropInPriceCents / 100).toFixed(0)}` : 'Plan only'}</strong>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="border-t-4 border-rhyze-orange bg-white p-5"><p className="text-xs font-black uppercase text-rhyze-black/45">{label}</p><p className="mt-2 font-display text-5xl">{value}</p></div>;
}
