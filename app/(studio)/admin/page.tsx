import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  Download,
  MessageCircle,
  Users,
} from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { calculateSombleMetrics } from '@/lib/admin/somble-metrics';

function money(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function dateTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(date);
}

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: { panel?: string };
}) {
  const panel = ['activity', 'community', 'upcoming', 'sales'].includes(
    searchParams.panel ?? '',
  )
    ? searchParams.panel!
    : 'activity';
  const now = new Date();
  const [
    profiles,
    transactions,
    upcoming,
    activeMemberships,
    nativeRevenue,
    productCount,
    classCount,
  ] = await Promise.all([
    prisma.sombleClientProfile.findMany({
      include: {
        user: {
          include: {
            _count: { select: { sombleTransactions: true, bookings: true } },
          },
        },
      },
      orderBy: { sourceJoinedAt: 'desc' },
    }),
    prisma.sombleTransaction.findMany({
      include: { user: true },
      orderBy: { transferredAt: 'desc' },
    }),
    prisma.classOccurrence.findMany({
      where: { startAt: { gte: now }, status: 'SCHEDULED' },
      include: {
        template: true,
        instructor: true,
        _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
      },
      orderBy: { startAt: 'asc' },
      take: 8,
    }),
    prisma.membership.count({
      where: { status: { in: ['ACTIVE', 'TRIALING'] } },
    }),
    prisma.purchase.aggregate({
      where: { status: 'PAID' },
      _sum: { amountCents: true },
    }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.classTemplate.count({ where: { isActive: true } }),
  ]);
  const metrics = calculateSombleMetrics(transactions);
  const downloadedCount = profiles.filter((item) => item.appDownloaded).length;
  const activity = [
    ...transactions.map((item) => ({
      id: `transaction-${item.id}`,
      at: item.transferredAt,
      name: item.user.name || item.supporterName,
      detail: `Transferred ${money(item.amountCents)} · ${item.contentType}`,
      href: '/admin/payments',
    })),
    ...profiles.map((item) => ({
      id: `client-${item.id}`,
      at: item.sourceJoinedAt,
      name: item.user.name || item.user.email,
      detail: 'Joined the Rhyze community through Somble',
      href: '/admin/members',
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 14);

  return (
    <>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
            Owner command center
          </p>
          <h1 className="mt-3 font-display text-6xl tracking-wider md:text-8xl">
            RHYZE OVERVIEW
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-bold text-rhyze-black/55">
            Live Rhyze data plus reconciled Somble history. Historical amounts
            are transferred revenue and may be net of processing fees.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/classes"
            className="bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase tracking-widest"
          >
            Add Offering
          </Link>
          <Link
            href="/api/admin/somble-export?type=transactions"
            className="inline-flex items-center gap-2 border border-rhyze-black/20 bg-white px-5 py-3 text-xs font-black uppercase tracking-widest"
          >
            <Download className="h-4 w-4" /> Export Sales
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Somble transferred revenue"
          value={money(metrics.transferredRevenueCents)}
          detail={`${transactions.length} reconciled transfers`}
          href="/admin/payments"
          icon={<CircleDollarSign />}
        />
        <Metric
          label="Imported clients"
          value={`${profiles.length}`}
          detail={`${metrics.uniqueCustomerCount} with transfers`}
          href="/admin/members"
          icon={<Users />}
        />
        <Metric
          label="Historical subscriptions"
          value={`${transactions.filter((item) => item.contentType === 'Subscription').length}`}
          detail={`${metrics.revenueByType.Subscription ? money(metrics.revenueByType.Subscription) : '$0.00'} transferred · ${activeMemberships} native active`}
          href="/admin/products"
          icon={<ArrowRight />}
        />
        <Metric
          label="Upcoming classes"
          value={`${upcoming.length}`}
          detail={`${classCount} class templates`}
          href="/admin/schedule"
          icon={<CalendarDays />}
        />
      </div>

      <section className="mt-8 overflow-hidden border border-black/10 bg-white">
        <div className="flex flex-wrap border-b border-black/10 bg-[#f5f0e6]">
          {[
            ['activity', 'Activity'],
            ['community', 'My Community'],
            ['upcoming', 'Upcoming'],
            ['sales', 'Sales'],
          ].map(([id, label]) => (
            <Link
              key={id}
              href={`/admin?panel=${id}`}
              className={`px-5 py-4 text-xs font-black uppercase tracking-widest ${
                panel === id
                  ? 'bg-rhyze-black text-rhyze-gold'
                  : 'text-rhyze-black/55 hover:bg-rhyze-coral/10'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {panel === 'activity' && (
          <div className="grid gap-0 xl:grid-cols-[22rem_1fr]">
            <div className="border-b border-black/10 p-5 xl:border-b-0 xl:border-r">
              <h2 className="font-display text-4xl tracking-wider">
                COMMUNITY PULSE
              </h2>
              <dl className="mt-5 grid gap-3">
                <Stat label="Total imported clients" value={profiles.length} />
                <Stat label="App downloaded" value={downloadedCount} />
                <Stat
                  label="Average transfer/customer"
                  value={money(metrics.averagePerCustomerCents)}
                />
                <Stat
                  label="Native Stripe revenue"
                  value={money(nativeRevenue._sum.amountCents ?? 0)}
                />
              </dl>
              <Link
                href="/admin/members"
                className="mt-5 flex items-center justify-between border-t border-black/10 pt-4 text-xs font-black uppercase text-rhyze-coral"
              >
                Open client directory <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="max-h-[34rem] overflow-y-auto">
              {activity.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="grid gap-1 border-b border-black/5 px-5 py-4 transition hover:bg-rhyze-gold/10 md:grid-cols-[1fr_auto]"
                >
                  <span>
                    <strong className="block">{item.name}</strong>
                    <small className="text-rhyze-black/55">{item.detail}</small>
                  </span>
                  <time className="text-xs font-bold text-rhyze-black/40">
                    {dateTime(item.at)}
                  </time>
                </Link>
              ))}
            </div>
          </div>
        )}

        {panel === 'community' && (
          <div className="p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-4xl tracking-wider">
                  MY COMMUNITY
                </h2>
                <p className="text-sm font-bold text-rhyze-black/45">
                  {profiles.length} imported clients · {downloadedCount} app
                  downloads
                </p>
              </div>
              <Link
                href="/admin/members"
                className="bg-rhyze-black px-4 py-3 text-xs font-black uppercase text-white"
              >
                Manage Clients
              </Link>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {profiles.slice(0, 12).map((profile) => (
                <Link
                  href={`/admin/members?q=${encodeURIComponent(profile.user.email)}`}
                  key={profile.id}
                  className="border-l-4 border-rhyze-orange bg-[#f5f0e6] p-4 hover:bg-rhyze-gold/15"
                >
                  <strong className="block">
                    {profile.user.name || profile.user.email}
                  </strong>
                  <span className="mt-1 block text-xs text-rhyze-black/50">
                    {profile.sourceStatus} ·{' '}
                    {profile.user._count.sombleTransactions} transfers
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {panel === 'upcoming' && (
          <div className="p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="font-display text-4xl tracking-wider">
                UPCOMING FLOOR
              </h2>
              <Link
                href="/admin/schedule"
                className="text-xs font-black uppercase text-rhyze-coral"
              >
                Full schedule
              </Link>
            </div>
            <div className="grid gap-3">
              {upcoming.map((item) => (
                <Link
                  key={item.id}
                  href={`/admin/schedule/${item.id}`}
                  className="grid gap-3 border border-black/10 p-4 hover:border-rhyze-coral md:grid-cols-[9rem_1fr_auto] md:items-center"
                >
                  <time className="font-display text-2xl tracking-wider">
                    {dateTime(item.startAt)}
                  </time>
                  <span>
                    <strong className="block">{item.template.name}</strong>
                    <small>
                      {item.instructor?.name || 'Instructor TBA'}
                    </small>
                  </span>
                  <strong>
                    {item._count.bookings}/{item.capacity} booked
                  </strong>
                </Link>
              ))}
              {!upcoming.length && (
                <p className="p-6 text-rhyze-black/50">
                  No upcoming classes are currently scheduled.
                </p>
              )}
            </div>
          </div>
        )}

        {panel === 'sales' && (
          <div className="overflow-x-auto p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="font-display text-4xl tracking-wider">
                SOMBLE TRANSFER LEDGER
              </h2>
              <Link
                href="/admin/payments"
                className="text-xs font-black uppercase text-rhyze-coral"
              >
                Full ledger
              </Link>
            </div>
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase text-rhyze-black/45">
                  <th className="p-3">Transfer date</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Transferred amount</th>
                  <th>Payment ID</th>
                </tr>
              </thead>
              <tbody>
                {transactions.slice(0, 12).map((item) => (
                  <tr key={item.id} className="border-b border-black/5">
                    <td className="p-3">{dateTime(item.transferredAt)}</td>
                    <td>{item.user.name || item.supporterName}</td>
                    <td>{item.contentType}</td>
                    <td className="font-black">
                      {money(item.amountCents)}
                    </td>
                    <td className="font-mono text-xs">{item.paymentId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-5 xl:grid-cols-2">
        <section className="border-t-4 border-rhyze-coral bg-white p-5">
          <h2 className="font-display text-4xl tracking-wider">
            REVENUE BY OFFERING
          </h2>
          <div className="mt-5 grid gap-3">
            {Object.entries(metrics.revenueByType)
              .sort((a, b) => b[1] - a[1])
              .map(([type, amount]) => (
                <Link
                  href="/admin/offerings"
                  key={type}
                  className="flex items-center justify-between border-b border-black/10 py-3"
                >
                  <span className="font-bold">{type}</span>
                  <strong>{money(amount)}</strong>
                </Link>
              ))}
          </div>
          <p className="mt-5 text-xs font-bold text-rhyze-black/40">
            {productCount} active native products are managed separately.
          </p>
        </section>
        <section className="border-t-4 border-rhyze-gold bg-rhyze-black p-5 text-rhyze-cream">
          <MessageCircle className="h-7 w-7 text-rhyze-gold" />
          <h2 className="mt-4 font-display text-4xl tracking-wider">
            CUSTOMER COMMUNICATION
          </h2>
          <p className="mt-3 text-sm font-bold text-rhyze-cream/55">
            Send studio announcements through campaigns or review queued class
            updates and transactional email.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href="/admin/campaigns"
              className="bg-rhyze-gradient px-4 py-3 text-xs font-black uppercase text-rhyze-black"
            >
              Create Announcement
            </Link>
            <Link
              href="/admin/messages"
              className="border border-white/20 px-4 py-3 text-xs font-black uppercase"
            >
              Message Center
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  detail,
  href,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group border-t-4 border-rhyze-orange bg-white p-5 transition hover:-translate-y-1 hover:border-rhyze-coral"
    >
      <span className="text-rhyze-coral [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <p className="mt-4 text-xs font-black uppercase tracking-widest text-rhyze-black/50">
        {label}
      </p>
      <strong className="mt-2 block font-display text-5xl tracking-wider">
        {value}
      </strong>
      <span className="mt-2 block text-xs font-bold text-rhyze-black/40">
        {detail}
      </span>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between border-b border-black/10 py-2">
      <dt className="text-xs font-bold text-rhyze-black/50">{label}</dt>
      <dd className="font-black">{value}</dd>
    </div>
  );
}
