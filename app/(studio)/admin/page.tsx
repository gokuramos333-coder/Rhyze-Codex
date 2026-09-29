import { FinancialReportView } from '@/components/admin/FinancialReportView';
import { loadFinancialReport, financialReportQuery, formatReportMoney } from '@/lib/admin/financial-report';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  Download,
  MessageCircle,
  Users,
} from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { confirmedRosterBookingWhere } from '@/lib/domain/bookings/known-cancellations';
import { calculateSombleMetrics } from '@/lib/admin/somble-metrics';
import { CountBars } from '@/components/admin/AnalyticsCharts';
import { buildAdminActivityItems } from '@/lib/admin/activity-client-metrics';
import { LiveDataRefresh } from '@/components/live/LiveDataRefresh';
import { excludeSombleBackedStripePaymentRecords } from '@/lib/admin/payment-record-dedupe';
import { activeMembershipUserWhere } from '@/lib/domain/memberships/active-membership';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

export default async function AdminHomePage(
  props: {
    searchParams: Promise<{ panel?: string; analytics?: string; range?: string; from?: string; to?: string; page?: string; offering?: string; occurrence?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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
    activeMembershipCount,
    classCount,
    totalAccounts,
    bookedUsers,
    upcomingCount,
    activityUsers,
    activityPurchases,
    activityMemberships,
    activityCommerceOrders,
    activityBookings,
    activityWaitlistEntries,
    activityAttendanceRecords,
    activityPaymentRecords,
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
        instructor: { include: { instructorProfile: true } },
        _count: { select: { bookings: { where: confirmedRosterBookingWhere() } } },
      },
      orderBy: { startAt: 'asc' },
      take: 8,
    }),
    prisma.user.count({ where: activeMembershipUserWhere }),
    prisma.classTemplate.count({ where: { isActive: true } }),
    prisma.user.count({
      where: {
        role: { in: ['MEMBER', 'INSTRUCTOR', 'MANAGER', 'ADMIN', 'OWNER'] },
        NOT: { email: { endsWith: '@rhyze.local' } },
      },
    }),
    prisma.booking.findMany({
      where: { status: { in: ['CONFIRMED', 'ATTENDED'] } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.classOccurrence.count({
      where: { startAt: { gte: now }, status: 'SCHEDULED' },
    }),
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
      where: {
        status: {
          in: [
            'PAID',
            'FULFILLMENT_REVIEW',
            'PARTIALLY_REFUNDED',
            'REFUNDED',
            'DISPUTED',
          ],
        },
      },
      include: { user: true, items: true },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.booking.findMany({
      include: { user: true, occurrence: { include: { template: true } } },
      orderBy: [{ updatedAt: 'desc' }, { bookedAt: 'desc' }],
      take: 100,
    }),
    prisma.waitlistEntry.findMany({
      include: { user: true, occurrence: { include: { template: true } } },
      orderBy: [{ updatedAt: 'desc' }, { joinedAt: 'desc' }],
      take: 100,
    }),
    prisma.attendanceRecord.findMany({
      include: { user: true, occurrence: { include: { template: true } } },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    }),
    prisma.paymentRecord.findMany({
      where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED'] } },
      include: { user: true },
      orderBy: { occurredAt: 'desc' },
    }),
  ]);
  const metrics = calculateSombleMetrics(transactions);
  const visiblePaymentRecords = excludeSombleBackedStripePaymentRecords(activityPaymentRecords, transactions);
  const report = await loadFinancialReport(searchParams, now);
  const analytics = searchParams.analytics === 'traffic' ? 'traffic' : 'earnings';
  const downloadedCount = profiles.filter((item) => item.appDownloaded).length;
  const revenueSummary = { uniqueCustomers: new Set(report.rows.map(row => row.userId).filter(Boolean)).size };
  const selectedNet = !report.providerReceiptCount ? 'Unavailable' : report.totals.filter(item => item.currency !== 'UNKNOWN').map(item => formatReportMoney(item.verifiedNetCents, item.currency)).join(' / ') || '$0.00';
  const selectedRefunds = !report.providerReceiptCount ? 'Unavailable' : report.totals.filter(item => item.currency !== 'UNKNOWN').map(item => formatReportMoney(item.verifiedRefundCents, item.currency)).join(' / ') || '$0.00';
  const activity = buildAdminActivityItems({
    users: activityUsers,
    purchases: activityPurchases,
    memberships: activityMemberships,
    commerceOrders: activityCommerceOrders,
    sombleTransactions: transactions.slice(0, 100),
    sombleProfiles: profiles.slice(0, 100),
    bookings: activityBookings,
    waitlistEntries: activityWaitlistEntries,
    attendanceRecords: activityAttendanceRecords,
    paymentRecords: visiblePaymentRecords,
  }).slice(0, 14);

  return (
    <>
      <LiveDataRefresh />
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
            Owner command center
          </p>
          <h1 className="mt-3 font-display text-6xl tracking-wider md:text-8xl">
            RHYZE OVERVIEW
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-bold text-rhyze-black/55">
            Native collection records plus imported Somble history. Imported amounts
            remain provider unverified and may be net of processing fees.
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
            href={`/api/reports/revenue?${financialReportQuery(searchParams)}`}
            className="inline-flex items-center gap-2 border border-rhyze-black/20 bg-white px-5 py-3 text-xs font-black uppercase tracking-widest"
          >
            <Download className="h-4 w-4" /> Export Sales
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label={`Verified Stripe net · ${report.range.label}`}
          value={selectedNet}
          detail="Retained live provider receipts; includes paid charges awaiting allocation"
          href={`/admin?${financialReportQuery(searchParams)}&analytics=earnings&panel=sales#earnings`}
          icon={<CircleDollarSign />}
        />
        <Metric
          label={`Verified refunds / disputes · ${report.range.label}`}
          value={selectedRefunds}
          detail="Verified financial outflows in the selected New York date range"
          href={`/admin?${financialReportQuery(searchParams)}&analytics=earnings&panel=sales#refunds-analytics`}
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
          label="Active memberships"
          value={`${activeMembershipCount}`}
          detail="Recurring members only · excludes trials and one-time purchases"
          href="/admin/members?membership=active"
          icon={<ArrowRight />}
        />
        <Metric
          label="Upcoming classes"
          value={`${upcomingCount}`}
          detail={`${classCount} class templates`}
          href="/admin/classes"
          icon={<CalendarDays />}
        />
      </div>

      <section id="earnings" className="mt-8 scroll-mt-24 border border-black/10 bg-[#f5f0e6] p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
              Live business analytics
            </p>
            <h2 className="mt-2 font-display text-5xl tracking-wider">
              {analytics === 'earnings' ? 'COLLECTIONS' : 'TRAFFIC + CONVERSION'}
            </h2>
          </div>
          <div className="flex">
            <Link
              href={`/admin?${financialReportQuery(searchParams)}&analytics=earnings&panel=${panel}`}
              className={`px-5 py-3 text-xs font-black uppercase tracking-widest ${
                analytics === 'earnings'
                  ? 'bg-rhyze-orange text-rhyze-black'
                  : 'bg-white text-rhyze-black/50'
              }`}
            >
              Collections
            </Link>
            <Link
              href={`/admin?${financialReportQuery(searchParams)}&analytics=traffic&panel=${panel}`}
              className={`px-5 py-3 text-xs font-black uppercase tracking-widest ${
                analytics === 'traffic'
                  ? 'bg-rhyze-orange text-rhyze-black'
                  : 'bg-white text-rhyze-black/50'
              }`}
            >
              Traffic
            </Link>
          </div>
        </div>
        {analytics === 'earnings' ? (
          <>
            <FinancialReportView report={report} basePath="/admin" preservedParams={{ analytics: 'earnings', panel: 'sales' }} ledger={false} />
          </>
        ) : (
          <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_.8fr]">
            <CountBars
              title="Known client conversion"
              items={[
                { label: 'Client accounts', value: totalAccounts },
                {
                  label: 'Customers with payment history',
                  value: revenueSummary.uniqueCustomers,
                },
                { label: 'Native class bookers', value: bookedUsers.length },
              ]}
              note="This uses real account, payment, and booking records. It updates as Rhyze activity is recorded."
            />
            <section className="border-t-4 border-rhyze-gold bg-white p-5">
              <p className="text-xs font-black uppercase tracking-widest text-rhyze-black/45">
                Website visit analytics
              </p>
              <strong className="mt-3 block font-display text-4xl tracking-wider">
                CONNECTION NEEDED
              </strong>
              <p className="mt-3 text-sm font-bold text-rhyze-black/50">
                Page visits, add-to-cart counts, geography, and acquisition
                sources require a privacy-conscious website analytics provider.
                No traffic numbers are invented here.
              </p>
              <Link
                href="/admin/integrations"
                className="mt-5 inline-flex bg-rhyze-black px-4 py-3 text-xs font-black uppercase tracking-widest text-white"
              >
                Open integrations
              </Link>
            </section>
          </div>
        )}
      </section>

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
              href={`/admin?${financialReportQuery(searchParams)}&panel=${id}`}
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
                  label="Selected verified Stripe net"
                  value={report.totals.filter(item => item.currency !== 'UNKNOWN').map(item => formatReportMoney(item.verifiedNetCents, item.currency)).join(' / ') || '$0.00'}
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
                  href={`/admin/members/${profile.userId}`}
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
                href="/admin/classes"
                className="text-xs font-black uppercase text-rhyze-coral"
              >
                All classes
              </Link>
            </div>
            <div className="grid gap-3">
              {upcoming.map((item) => (
                <Link
                  key={item.id}
                  href={`/admin/classes/${item.templateId}`}
                  className="grid gap-3 border border-black/10 p-4 hover:border-rhyze-coral md:grid-cols-[9rem_3.5rem_1fr_auto] md:items-center"
                >
                  <time className="font-display text-2xl tracking-wider">
                    {dateTime(item.startAt)}
                  </time>
                  {item.instructor?.instructorProfile?.photoUrl ? (
                    <Image
                      src={item.instructor.instructorProfile.photoUrl}
                      alt=""
                      width={48}
                      height={48}
                      unoptimized={item.instructor.instructorProfile.photoUrl.startsWith('/api/media/')}
                      className="h-12 w-12 object-cover"
                    />
                  ) : (
                    <span className="grid h-12 w-12 place-items-center bg-rhyze-orange/10 font-display text-2xl">
                      {(item.instructor?.name || 'T').slice(0, 1)}
                    </span>
                  )}
                  <span>
                    <strong className="block">{item.template.name}</strong>
                    <small>
                      {item.instructor?.name || 'Instructor TBA'}
                    </small>
                  </span>
                  <strong>
                    {item._count.bookings + item.historicalSignupCount}/{item.capacity} booked
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

        {panel === 'sales' && <div className="p-5"><FinancialReportView report={report} basePath="/admin" preservedParams={{ panel: 'sales', analytics: 'earnings' }} summary={analytics !== 'earnings'} /></div>}
      </section>

      <div className="mt-8 grid gap-5 xl:grid-cols-2">
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
