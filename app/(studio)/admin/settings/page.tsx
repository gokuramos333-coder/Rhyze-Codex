import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';

const settings = [
  ['Owner access', 'Only Vanessa and Melissa OWNER accounts', '/admin/instructors'],
  ['Waiver versions', 'Review active policy and signatures', '/admin/waivers'],
  ['Class cancellation', '6-hour transfer window and late-cancel rules', '/policies#cancellation'],
  ['Products and credits', 'Membership prices, billing, and eligibility', '/admin/products'],
  ['Email delivery', 'Queue status and campaign controls', '/admin/messages'],
  ['Reporting', 'Revenue, attendance, membership, and class exports', '/admin/reports'],
] as const;

export default async function AdminSettingsPage() {
  const [profiles, transactions, revenue] = await Promise.all([
    prisma.sombleClientProfile.count(),
    prisma.sombleTransaction.count(),
    prisma.sombleTransaction.aggregate({ _sum: { amountCents: true } }),
  ]);
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Configuration</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">SETTINGS</h1>
      <section className="mt-8 border-t-4 border-rhyze-coral bg-white p-6">
        <h2 className="font-display text-4xl tracking-wider">SOMBLE MIGRATION</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Imported clients" value={`${profiles}`} />
          <Stat label="Historical transfers" value={`${transactions}`} />
          <Stat label="Transferred revenue" value={`$${((revenue._sum.amountCents ?? 0) / 100).toFixed(2)}`} />
        </div>
        <p className="mt-4 text-xs font-bold text-rhyze-black/45">Import is idempotent. Historical transfers are read-only and retain their original Somble/Stripe identifiers.</p>
      </section>
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {settings.map(([name, detail, href]) => (
          <Link href={href} key={name} className="border-l-4 border-rhyze-gold bg-white p-5 hover:border-rhyze-coral">
            <strong className="font-display text-3xl tracking-wider">{name}</strong>
            <p className="mt-2 text-sm font-bold text-rhyze-black/50">{detail}</p>
          </Link>
        ))}
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bg-[#eee9dd] p-4"><p className="text-xs font-black uppercase text-rhyze-black/45">{label}</p><p className="mt-2 font-display text-4xl">{value}</p></div>;
}
