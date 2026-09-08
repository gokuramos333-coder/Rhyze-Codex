import { prisma } from '@/lib/db/prisma';
import { MembershipCatalogOrder } from '@/components/admin/MembershipCatalogOrder';
import {
  DistributionBars,
  RevenueAreaChart,
} from '@/components/admin/AnalyticsCharts';
import {
  buildDailyRevenueSeries,
  recordsInRange,
  summarizeRevenue,
} from '@/lib/admin/dashboard-analytics';
import { createProductAction, deleteProductAction, saveProductOrderAction, toggleProductAction } from './actions';
import { AnalyticsRangeControls } from '@/components/admin/AnalyticsRangeControls';
import { resolveAnalyticsRange } from '@/lib/admin/analytics-range';
import Link from 'next/link';

export default async function AdminProductsPage(
  props: { searchParams: Promise<{ saved?: string; error?: string; range?: string; from?: string; to?: string }> }
) {
  const searchParams = await props.searchParams;
  const [products, sombleRevenue, nativeRevenue, activeMembers] =
    await Promise.all([
      prisma.product.findMany({
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.sombleTransaction.findMany({
        where: { contentType: { in: ['Subscription', 'Classpack'] } },
        select: {
          amountCents: true,
          transferredAt: true,
          userId: true,
          contentType: true,
        },
      }),
      prisma.purchase.findMany({
        where: { status: 'PAID' },
        select: {
          amountCents: true,
          refundedAmountCents: true,
          paidAt: true,
          createdAt: true,
          userId: true,
          product: { select: { name: true } },
        },
      }),
      prisma.membership.count({
        where: { status: { in: ['ACTIVE', 'TRIALING'] } },
      }),
    ]);
  const range = resolveAnalyticsRange(searchParams);
  const allRevenueRecords = [
    ...sombleRevenue.map((item) => ({
      amountCents: item.amountCents,
      occurredAt: item.transferredAt,
      customerId: item.userId,
      type: item.contentType,
      source: 'SOMBLE' as const,
    })),
    ...nativeRevenue.map((item) => ({
      amountCents: item.amountCents - item.refundedAmountCents,
      occurredAt: item.paidAt || item.createdAt,
      customerId: item.userId,
      type: item.product.name,
      source: 'RHYZE' as const,
    })),
  ];
  const revenueRecords = recordsInRange(allRevenueRecords, range.start, range.end);
  const summary = summarizeRevenue(revenueRecords);
  const series = buildDailyRevenueSeries(revenueRecords, range.start, range.end);
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Commerce catalog</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">MEMBERSHIPS</h1>
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <Metric label={`Membership revenue · ${range.label}`} value={`$${(summary.totalCents / 100).toFixed(0)}`} href="/admin/payments" />
        <Metric label="Active native members" value={`${activeMembers}`} href="/admin/members" />
        <Metric label="Paying clients" value={`${summary.uniqueCustomers}`} href="/admin/members" />
      </div>
      <AnalyticsRangeControls basePath="/admin/products" active={range.key} from={searchParams.from} to={searchParams.to} />
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.5fr_.9fr]">
        <RevenueAreaChart
          title={`Membership revenue · ${range.label}`}
          points={series.map((point) => ({
            label: point.label,
            value: point.amountCents,
          }))}
        />
        <DistributionBars
          title="Membership revenue by plan/type"
          href="/admin/products"
          items={Object.entries(summary.byType).map(([label, value]) => ({
            label,
            value,
          }))}
        />
      </div>
      {searchParams.saved && <p className="mt-5 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">Membership catalog updated.</p>}
      {searchParams.error === 'history' && <p className="mt-5 border-l-4 border-rhyze-coral bg-white p-4 font-bold">This membership has purchase history, so it was safely deactivated instead of permanently deleted.</p>}
      <form action={createProductAction} className="mt-8 grid gap-4 border-t-4 border-rhyze-gold bg-white p-6 md:grid-cols-2">
        <Field name="name" label="Plan name" required />
        <Field name="price" label="Price (USD)" type="number" required />
        <Select name="kind" label="Plan type" values={['INTRO_TRIAL','MONTHLY_UNLIMITED','LIMITED_MEMBERSHIP','CLASS_PACK','DROP_IN','VIP','CUSTOM']} />
        <Field name="customPlanType" label="New plan type (when Custom is selected)" />
        <Select name="billingInterval" label="Billing" values={['ONE_TIME','MONTHLY','YEARLY']} />
        <Field name="credits" label="Included credits" type="number" />
        <label className="grid gap-2 md:col-span-2"><span className="text-xs font-black uppercase tracking-widest">Full website description</span><textarea name="description" required className="min-h-28 border p-3" /></label>
        <Field name="availabilityStart" label="Available from" type="date" />
        <Field name="availabilityEnd" label="Available through" type="date" />
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="isUnlimited" /> Unlimited access</label>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="isPublic" defaultChecked /> Publicly visible</label>
        <label className="flex items-center gap-2 text-sm font-bold md:col-span-2"><input type="checkbox" name="alwaysAvailable" defaultChecked /> Always available (ignore date range)</label>
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">Create product</button>
      </form>
      <MembershipCatalogOrder
        saveOrder={saveProductOrderAction}
        toggleProduct={toggleProductAction}
        deleteProduct={deleteProductAction}
        initialItems={products.map((product) => ({
          id: product.id,
          name: product.name,
          type: product.customPlanType || product.kind.replaceAll('_', ' '),
          price: `$${(product.priceCents / 100).toFixed(2)}`,
          billing: product.billingInterval.replace('_', ' '),
          description: product.description,
          active: product.isActive,
        }))}
      />
    </>
  );
}

function Metric({ label, value, href }: { label: string; value: string; href: string }) {
  return <Link href={href} className="border-t-4 border-rhyze-orange bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg"><p className="text-xs font-black uppercase text-rhyze-black/45">{label}</p><p className="mt-2 font-display text-5xl">{value}</p></Link>;
}

function Field({ name, label, type = 'text', required = false }: { name: string; label: string; type?: string; required?: boolean }) {
  return <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">{label}</span><input name={name} type={type} required={required} className="min-h-12 border px-3" /></label>;
}
function Select({ name, label, values }: { name: string; label: string; values: string[] }) {
  return <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-widest">{label}</span><select name={name} className="min-h-12 border px-3">{values.map((value) => <option key={value}>{value}</option>)}</select></label>;
}
