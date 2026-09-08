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
import { calculateSombleMetrics } from '@/lib/admin/somble-metrics';
import {
  buildDailyFinancialSeries,
  recordsInRange,
  summarizeFinancials,
  summarizeRevenue,
} from '@/lib/admin/dashboard-analytics';
import {
  CountBars,
  DistributionBars,
  RevenueAreaChart,
} from '@/components/admin/AnalyticsCharts';
import { AnalyticsRangeControls } from '@/components/admin/AnalyticsRangeControls';
import { resolveAnalyticsRange } from '@/lib/admin/analytics-range';
import { buildAdminActivityItems } from '@/lib/admin/activity-client-metrics';
import { LiveDataRefresh } from '@/components/live/LiveDataRefresh';
import { syncRecentStripePaymentRecords } from '@/lib/payments/stripe-payment-sync';
import { excludeSombleBackedStripePaymentRecords } from '@/lib/admin/payment-record-dedupe';
import { activeMembershipUserWhere } from '@/lib/domain/memberships/active-membership';
import {
  buildReconciledRevenueRecords,
  selectStandaloneRevenuePaymentRecords,
} from '@/lib/admin/reconciled-financials';
import { RefundedBadge } from '@/components/admin/RefundedBadge';

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
    searchParams: Promise<{ panel?: string; analytics?: string; range?: string; from?: string; to?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const panel = ['activity', 'community', 'upcoming', 'sales'].includes(
    searchParams.panel ?? '',
  )
    ? searchParams.panel!
    : 'activity';
  const now = new Date();
  await syncRecentStripePaymentRecords(prisma).catch((error) => {
    console.error('Stripe payment sync failed', error);
  });
  const [
    profiles,
    transactions,
    upcoming,
    activeMembershipCount,
    nativeRevenue,
    productCount,
    classCount,
    nativePurchases,
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
    refunds,
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
        _count: { select: { bookings: { where: { status: 'CONFIRMED' } } } },
      },
      orderBy: { startAt: 'asc' },
      take: 8,
    }),
    prisma.user.count({ where: activeMembershipUserWhere }),
    prisma.purchase.aggregate({
      where: { status: 'PAID' },
      _sum: { amountCents: true },
    }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.classTemplate.count({ where: { isActive: true } }),
    prisma.purchase.findMany({
      where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } },
      select: {
        amountCents: true,
        refundedAmountCents: true,
        paidAt: true,
        createdAt: true,
        userId: true,
        user: { select: { name: true, email: true } },
        product: { select: { name: true } },
      },
    }),
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
      include: { user: true, membership: { select: { activatedAt: true } } },
      orderBy: { occurredAt: 'desc' },
    }),
    prisma.refund.findMany({
      include: { purchase: { include: { user: true, product: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const commerceRefunds = await prisma.commerceRefund.findMany({
    include: {
      commerceOrder: { include: { user: true, items: true } },
    },
    orderBy: { createdAt: 'desc' },
  }).catch(() => null);
  const metrics = calculateSombleMetrics(transactions);
  const visiblePaymentRecords = excludeSombleBackedStripePaymentRecords(activityPaymentRecords, transactions);
  const unlinkedPaymentRecords = visiblePaymentRecords.filter(
    (record) => !record.purchaseId && !record.commerceOrderId,
  );
  const directRevenuePaymentRecords = unlinkedPaymentRecords.filter(
    (record) => record.userId || record.membershipId,
  );
  const standaloneRevenuePaymentRecords = selectStandaloneRevenuePaymentRecords(
    visiblePaymentRecords,
    nativePurchases,
  );
  const range = resolveAnalyticsRange(searchParams);
  const allRevenueRecords = buildReconciledRevenueRecords({
    sombleTransactions: transactions,
    purchases: nativePurchases,
    commerceOrders: activityCommerceOrders,
    paymentRecords: activityPaymentRecords,
  });
  const directRefundRecords = directRevenuePaymentRecords
    .filter((item) => item.refundedAmountCents > 0)
    .map((item) => ({
      amountCents: item.refundedAmountCents,
      occurredAt: item.updatedAt,
      customerId: item.userId || `guest-stripe-${item.id}`,
      type: item.kind.replaceAll('_', ' '),
      source: 'RHYZE' as const,
    }));
  const commerceRefundRecords = commerceRefunds
    ? commerceRefunds.map((item) => ({
        amountCents: item.amountCents,
        occurredAt: item.createdAt,
        customerId: item.commerceOrder.userId || `guest-order-${item.commerceOrderId}`,
        type: item.commerceOrder.kind,
        source: 'RHYZE' as const,
      }))
    : activityCommerceOrders
        .filter((item) => item.refundedAmountCents > 0)
        .map((item) => ({
          amountCents: item.refundedAmountCents,
          occurredAt: item.updatedAt,
          customerId: item.userId || `guest-order-${item.id}`,
          type: item.kind,
          source: 'RHYZE' as const,
        }));
  const allRefundRecords = [
    ...refunds.map((item) => ({
      amountCents: item.amountCents,
      occurredAt: item.createdAt,
      customerId: item.purchase.userId,
      type: item.purchase.product.name,
      source: 'RHYZE' as const,
    })),
    ...commerceRefundRecords,
    ...directRefundRecords,
  ];
  const revenueRecords = recordsInRange(allRevenueRecords, range.start, range.end);
  const refundRecords = recordsInRange(allRefundRecords, range.start, range.end);
  const revenueSummary = summarizeRevenue(revenueRecords);
  const financialSummary = summarizeFinancials(revenueRecords, refundRecords);
  const financialSeries = buildDailyFinancialSeries(
    revenueRecords,
    refundRecords,
    range.start,
    range.end,
  );
  const monthRange = resolveAnalyticsRange({ range: 'month' }, now);
  const monthFinancialSummary = summarizeFinancials(
    recordsInRange(allRevenueRecords, monthRange.start, monthRange.end),
    recordsInRange(allRefundRecords, monthRange.start, monthRange.end),
  );
  const commerceRefundDetails = commerceRefunds
    ? commerceRefunds.map((item) => ({
        id: `commerce-${item.id}`,
        amountCents: item.amountCents,
        occurredAt: item.createdAt,
        name: item.commerceOrder.user?.name || item.commerceOrder.customerName || item.commerceOrder.customerEmail || 'Guest customer',
        itemName: item.commerceOrder.items.map((orderItem) => orderItem.name).join(', ') || item.commerceOrder.kind,
        reason: item.reason || 'Commerce refund',
        href: item.commerceOrder.userId ? `/admin/members/${item.commerceOrder.userId}` : '/admin/payments',
      }))
    : activityCommerceOrders
        .filter((item) => item.refundedAmountCents > 0)
        .map((item) => ({
          id: `commerce-legacy-${item.id}`,
          amountCents: item.refundedAmountCents,
          occurredAt: item.updatedAt,
          name: item.user?.name || item.customerName || item.customerEmail || 'Guest customer',
          itemName: item.items.map((orderItem) => orderItem.name).join(', ') || item.kind,
          reason: 'Historical commerce refund',
          href: item.userId ? `/admin/members/${item.userId}` : '/admin/payments',
        }));
  const allRefundDetails = [
    ...refunds.map((item) => ({
      id: `purchase-${item.id}`,
      amountCents: item.amountCents,
      occurredAt: item.createdAt,
      name: item.purchase.user.name || item.purchase.user.email,
      itemName: item.purchase.product.name,
      reason: item.reason || 'Purchase refund',
      href: `/admin/members/${item.purchase.userId}`,
    })),
    ...commerceRefundDetails,
    ...directRevenuePaymentRecords
      .filter((item) => item.refundedAmountCents > 0)
      .map((item) => ({
        id: `direct-${item.id}`,
        amountCents: item.refundedAmountCents,
        occurredAt: item.updatedAt,
        name: item.user?.name || item.customerName || item.customerEmail || 'Stripe customer',
        itemName: item.kind.replaceAll('_', ' '),
        reason: 'Direct Stripe refund',
        href: item.userId ? `/admin/members/${item.userId}` : '/admin/payments',
      })),
  ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const rangeRefundDetails = allRefundDetails.filter(
    (item) => item.occurredAt >= range.start && item.occurredAt <= range.end,
  );
  const analytics =
    searchParams.analytics === 'traffic' ? 'traffic' : 'earnings';
  const downloadedCount = profiles.filter((item) => item.appDownloaded).length;
  const refundTotalCents = allRefundRecords.reduce((total, item) => total + item.amountCents, 0);
  const sombleTransferRevenueCents = transactions.reduce((total, item) => total + item.amountCents, 0);
  const nativeGrossRevenueCents = nativePurchases.reduce((total, item) => total + item.amountCents, 0);
  const nativeRefundedRevenueCents = nativePurchases.reduce((total, item) => total + item.refundedAmountCents, 0);
  const nativeCommerceGrossRevenueCents = activityCommerceOrders.reduce((total, item) => total + item.amountCents, 0);
  const nativeCommerceRefundedRevenueCents = commerceRefundRecords.reduce((total, item) => total + item.amountCents, 0);
  const directStripeGrossRevenueCents = standaloneRevenuePaymentRecords.reduce((total, item) => total + item.amountCents, 0);
  const directStripeRefundedRevenueCents = directRevenuePaymentRecords.reduce((total, item) => total + item.refundedAmountCents, 0);
  const totalGrossRevenueCents = sombleTransferRevenueCents + nativeGrossRevenueCents + nativeCommerceGrossRevenueCents + directStripeGrossRevenueCents;
  const totalRevenueCents = totalGrossRevenueCents - nativeRefundedRevenueCents - nativeCommerceRefundedRevenueCents - directStripeRefundedRevenueCents;
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

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Revenue this month"
          value={money(monthFinancialSummary.netCents)}
          detail={`${money(monthFinancialSummary.grossCents)} gross - ${money(monthFinancialSummary.refundCents)} refunded`}
          href="/admin?analytics=earnings&panel=sales&range=month#earnings"
          icon={<CircleDollarSign />}
        />
        <Metric
          label="Refunds this month"
          value={money(monthFinancialSummary.refundCents)}
          detail="Issued during the current New York calendar month"
          href="/admin?analytics=earnings&panel=sales&range=month#refunds-analytics"
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
              {analytics === 'earnings' ? 'EARNINGS' : 'TRAFFIC + CONVERSION'}
            </h2>
          </div>
          <div className="flex">
            <Link
              href={`/admin?analytics=earnings&panel=${panel}`}
              className={`px-5 py-3 text-xs font-black uppercase tracking-widest ${
                analytics === 'earnings'
                  ? 'bg-rhyze-orange text-rhyze-black'
                  : 'bg-white text-rhyze-black/50'
              }`}
            >
              Earnings
            </Link>
            <Link
              href={`/admin?analytics=traffic&panel=${panel}`}
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
            <AnalyticsRangeControls
              basePath="/admin"
              active={range.key}
              from={searchParams.from}
              to={searchParams.to}
              preservedParams={{ analytics: 'earnings', panel: 'sales' }}
            />
            <dl className="mt-5 grid gap-3 md:grid-cols-3">
              <Stat label="Gross revenue" value={money(financialSummary.grossCents)} />
              <Stat label="Refunds issued" value={money(financialSummary.refundCents)} />
              <Stat label="Net revenue" value={money(financialSummary.netCents)} />
            </dl>
            <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_.8fr]">
              <RevenueAreaChart
                title={`Net revenue · ${range.label}`}
                points={financialSeries.map((point) => ({
                  label: point.label,
                  value: point.netCents,
                }))}
              />
              <DistributionBars
                title={`Revenue by type · ${range.label}`}
                href="/admin/payments"
                items={Object.entries(revenueSummary.byType).map(
                  ([label, value]) => ({ label, value }),
                )}
              />
            </div>
            <div id="refunds-analytics" className="mt-5 scroll-mt-24">
              <RevenueAreaChart
                title={`Refunds · ${range.label}`}
                emptyLabel="No refunds were issued during this period."
                href="/admin?panel=sales#refunds"
                points={financialSeries.map((point) => ({
                  label: point.label,
                  value: point.refundCents,
                }))}
              />
              <section className="border-t border-black/10 bg-white p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <h3 className="font-display text-3xl tracking-wider">REFUND DETAILS · {range.label}</h3>
                  <strong>{rangeRefundDetails.length} records</strong>
                </div>
                <div className="mt-4 grid gap-2">
                  {rangeRefundDetails.map((refund) => (
                    <Link key={refund.id} href={refund.href} className="grid gap-1 border-b border-black/10 py-3 hover:text-rhyze-coral md:grid-cols-[1fr_auto]">
                      <span>
                        <span className="flex flex-wrap items-center gap-2">
                          <RefundedBadge />
                          <strong>{refund.itemName}</strong>
                        </span>
                        <small className="mt-1 block">{refund.name} · {refund.reason} · {dateTime(refund.occurredAt)}</small>
                      </span>
                      <strong>{money(refund.amountCents)}</strong>
                    </Link>
                  ))}
                  {!rangeRefundDetails.length && <p className="py-3 text-sm font-bold text-rhyze-black/45">No refunds were issued during this period.</p>}
                </div>
              </section>
            </div>
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

        {panel === 'sales' && (
          <div className="overflow-x-auto p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="font-display text-4xl tracking-wider">
                SYNCED SALES LEDGER
              </h2>
              <Link
                href="/admin/payments"
                className="text-xs font-black uppercase text-rhyze-coral"
              >
                Full ledger
              </Link>
            </div>
            <section className="mb-5 border-t-4 border-rhyze-orange bg-rhyze-black p-5 text-rhyze-cream">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-gold">Total revenue</p>
              <strong className="mt-2 block font-display text-6xl tracking-wider">{money(totalRevenueCents)}</strong>
              <p className="mt-2 text-sm font-bold text-rhyze-cream/60">Somble transferred revenue + verified Rhyze memberships, class packs, events, merchandise, and direct Stripe charges - refunds. Charges already represented elsewhere are excluded so money is counted once.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-6">
                <Stat label="Somble transfers" value={money(sombleTransferRevenueCents)} />
                <Stat label="Memberships + class packs" value={money(nativeGrossRevenueCents)} />
                <Stat label="Events + merchandise" value={money(nativeCommerceGrossRevenueCents)} />
                <Stat label="Verified direct Stripe" value={money(directStripeGrossRevenueCents)} />
                <Stat label="Refunds deducted" value={money(nativeRefundedRevenueCents + nativeCommerceRefundedRevenueCents + directStripeRefundedRevenueCents)} />
                <Stat label="Synced rows" value={`${transactions.length + nativePurchases.length + activityCommerceOrders.length + unlinkedPaymentRecords.length}`} />
              </div>
            </section>
            <div className="mb-5 grid gap-3 md:grid-cols-3">
              <Stat label="Gross synced revenue" value={money(totalGrossRevenueCents)} />
              <Stat label="Net synced revenue" value={money(totalRevenueCents)} />
              <Stat label="Refunds issued" value={money(refundTotalCents)} />
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
                {nativePurchases.slice(0, 12).map((item) => (
                  <tr key={`native-${item.userId}-${item.createdAt.toISOString()}`} className="border-b border-black/5">
                    <td className="p-3">{dateTime(item.paidAt || item.createdAt)}</td>
                    <td><Link className="font-bold text-rhyze-coral" href={`/admin/members/${item.userId}`}>{item.user.name || item.user.email}</Link></td>
                    <td>{item.product.name}</td>
                    <td className="font-black">{money(item.amountCents - item.refundedAmountCents)}</td>
                    <td className="font-mono text-xs">Rhyze native</td>
                  </tr>
                ))}
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
            <section id="refunds" className="mt-8 scroll-mt-24 border-t-4 border-rhyze-coral bg-[#f5f0e6] p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Refund records</p>
                  <h3 className="font-display text-4xl tracking-wider">REFUNDS</h3>
                </div>
                <strong>{money(refundTotalCents)} total refunded</strong>
              </div>
              <div className="grid gap-3">
                {allRefundDetails.map((refund) => (
                  <Link key={refund.id} href={refund.href} className="grid gap-2 bg-white p-4 hover:bg-rhyze-gold/10 md:grid-cols-[1fr_auto]">
                    <span>
                      <span className="flex flex-wrap items-center gap-2">
                        <RefundedBadge />
                        <strong>{refund.itemName}</strong>
                      </span>
                      <small className="mt-1 block text-rhyze-black/55">{refund.name} · {refund.reason} · {dateTime(refund.occurredAt)}</small>
                    </span>
                    <strong>{money(refund.amountCents)}</strong>
                  </Link>
                ))}
                {!allRefundDetails.length && <p className="bg-white p-4 text-sm font-bold text-rhyze-black/45">No refunds recorded yet.</p>}
              </div>
            </section>
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
                  href="/admin/products"
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
