import Link from 'next/link';
import { Download, Mail, Search } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';

function date(value: Date | null) {
  return value
    ? value.toLocaleDateString('en-US', { timeZone: 'America/New_York' })
    : '—';
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  const q = searchParams.q?.trim();
  const status = searchParams.status?.trim();
  const members = await prisma.user.findMany({
    where: {
      sombleClientProfile: status ? { sourceStatus: status } : { isNot: null },
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      sombleClientProfile: true,
      memberships: { include: { product: true } },
      _count: { select: { bookings: true, sombleTransactions: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const total = await prisma.sombleClientProfile.count();

  return (
    <>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
            Community
          </p>
          <h1 className="mt-3 font-display text-6xl tracking-wider">
            CLIENTS
          </h1>
          <p className="mt-2 text-sm font-bold text-rhyze-black/50">
            {total} Somble client histories moved into the Rhyze directory.
          </p>
        </div>
        <Link
          href="/api/admin/somble-export?type=clients"
          className="inline-flex items-center gap-2 bg-rhyze-black px-5 py-3 text-xs font-black uppercase text-white"
        >
          <Download className="h-4 w-4" /> Export Clients
        </Link>
      </div>

      <form className="mt-7 grid gap-3 border-t-4 border-rhyze-gold bg-white p-4 md:grid-cols-[1fr_14rem_auto]">
        <label className="relative">
          <Search className="absolute left-4 top-4 h-4 w-4 text-rhyze-black/35" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search client name or email"
            className="min-h-12 w-full border border-black/15 pl-11 pr-4"
          />
        </label>
        <select
          name="status"
          defaultValue={status || ''}
          className="min-h-12 border border-black/15 px-3"
        >
          <option value="">All Somble statuses</option>
          <option value="inactive">Inactive</option>
          <option value="at-risk">At-risk</option>
          <option value="invited">Invited</option>
          <option value="test">Test</option>
        </select>
        <button className="bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest">
          Apply
        </button>
      </form>

      <div className="mt-5 overflow-x-auto bg-white">
        <table className="w-full min-w-[72rem] text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-xs uppercase text-rhyze-black/45">
              <th className="p-4">Client</th>
              <th>Somble status</th>
              <th>Date joined</th>
              <th>Last login</th>
              <th>Workouts</th>
              <th>App</th>
              <th>Transfers</th>
              <th>Current plan</th>
              <th>Contact</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-black/5 hover:bg-rhyze-gold/10">
                <td className="p-4">
                  <strong className="block">{member.name || 'Profile incomplete'}</strong>
                  <small>{member.email}</small>
                </td>
                <td>
                  <span className="rounded-full bg-[#eee9dd] px-3 py-1 text-xs font-black uppercase">
                    {member.sombleClientProfile?.sourceStatus}
                  </span>
                </td>
                <td>{date(member.sombleClientProfile?.sourceJoinedAt ?? null)}</td>
                <td>{date(member.sombleClientProfile?.lastLoginAt ?? null)}</td>
                <td>{member.sombleClientProfile?.totalWorkouts ?? 0}</td>
                <td>{member.sombleClientProfile?.appDownloaded ? 'Downloaded' : '—'}</td>
                <td>{member._count.sombleTransactions}</td>
                <td>{member.memberships[0]?.product.name || 'No native plan'}</td>
                <td>
                  <a
                    href={`mailto:${member.email}`}
                    aria-label={`Email ${member.name || member.email}`}
                    className="inline-flex rounded-full border border-black/15 p-2 hover:border-rhyze-coral hover:text-rhyze-coral"
                  >
                    <Mail className="h-4 w-4" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!members.length && <p className="p-8">No matching clients.</p>}
      </div>
    </>
  );
}
