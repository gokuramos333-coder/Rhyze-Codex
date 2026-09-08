import Link from 'next/link';
import { Download, Mail, Search } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import { adminClientStatus, claimedAccountStatusUpdateWhere } from '@/lib/admin/client-status';
import {
  buildClientDirectoryWhere,
  currentMembershipStatuses,
} from '@/lib/admin/client-directory-filters';
import {
  clientDirectoryBookedClassCount,
  clientDirectoryJoinedAt,
  clientDirectoryLastLoginAt,
  clientDirectoryWorkoutCount,
} from '@/lib/admin/activity-client-metrics';

function date(value: Date | null) {
  return value
    ? value.toLocaleDateString('en-US', { timeZone: 'America/New_York' })
    : '—';
}

export default async function AdminMembersPage(
  props: {
    searchParams: Promise<{
      q?: string;
      source?: string;
      plan?: string;
      account?: string;
      sort?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
  const q = searchParams.q?.trim();
  const source = searchParams.source?.trim();
  const plan = searchParams.plan?.trim();
  const account = searchParams.account?.trim();
  const sort = searchParams.sort || 'joined-desc';
  await prisma.user.updateMany({
    where: claimedAccountStatusUpdateWhere(),
    data: { status: 'ACTIVE' },
  });
  const orderBy =
    sort === 'name-asc'
      ? ({ name: 'asc' } as const)
      : sort === 'name-desc'
        ? ({ name: 'desc' } as const)
        : sort === 'joined-asc'
          ? ({ createdAt: 'asc' } as const)
          : ({ createdAt: 'desc' } as const);
  const members = await prisma.user.findMany({
    where: buildClientDirectoryWhere({ q, source, plan, account }),
    include: {
      sombleClientProfile: true,
      memberships: {
        where: { status: { in: currentMembershipStatuses } },
        include: { product: true },
        orderBy: { createdAt: 'desc' },
      },
      attendanceRecords: { select: { status: true, checkedInAt: true } },
      bookings: {
        select: {
          status: true,
          occurrence: { select: { status: true } },
        },
      },
      _count: { select: { bookings: true, sombleTransactions: true } },
    },
    orderBy,
    take: 200,
  });
  const [sombleTotal, nativeTotal, membershipPlans] = await Promise.all([
    prisma.sombleClientProfile.count(),
    prisma.user.count({
      where: {
        sombleClientProfile: null,
        NOT: { email: { endsWith: '@rhyze.local' } },
      },
    }),
    prisma.product.findMany({
      where: {
        memberships: {
          some: { status: { in: currentMembershipStatuses } },
        },
      },
      select: { id: true, name: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    }),
  ]);

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
            {sombleTotal} Somble histories + {nativeTotal} native Rhyze accounts.
          </p>
        </div>
        <Link
          href="/api/admin/somble-export?type=clients"
          className="inline-flex items-center gap-2 bg-rhyze-black px-5 py-3 text-xs font-black uppercase text-white"
        >
          <Download className="h-4 w-4" /> Export Clients
        </Link>
      </div>

      <form className="mt-7 grid gap-3 border-t-4 border-rhyze-gold bg-white p-4 lg:grid-cols-[minmax(14rem,1fr)_11rem_12rem_14rem_11rem_auto]">
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
          name="source"
          defaultValue={source || ''}
          className="min-h-12 border border-black/15 px-3"
          aria-label="Filter clients by source or account type"
        >
          <option value="">All</option>
          <option value="somble">Somble Transferred</option>
          <option value="native">Native Rhyze</option>
          <option value="instructors">Instructors</option>
        </select>
        <select
          name="account"
          defaultValue={account || ''}
          className="min-h-12 border border-black/15 px-3"
          aria-label="Filter clients by account status"
        >
          <option value="">All Account Statuses</option>
          <option value="active">Active Members</option>
          <option value="unclaimed">To Be Claimed</option>
        </select>
        <select
          name="plan"
          defaultValue={plan || ''}
          className="min-h-12 border border-black/15 px-3"
          aria-label="Filter clients by membership plan"
        >
          <option value="">All Membership Plans</option>
          {membershipPlans.map((membershipPlan) => (
            <option key={membershipPlan.id} value={membershipPlan.id}>
              {membershipPlan.name}
            </option>
          ))}
          <option value="none">No native plan</option>
        </select>
        <select name="sort" defaultValue={sort} className="min-h-12 border border-black/15 px-3">
          <option value="joined-desc">Newest joined</option>
          <option value="joined-asc">Oldest joined</option>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
        </select>
        <button className="bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest">
          Apply
        </button>
      </form>

      <div className="mt-5 overflow-x-auto bg-white">
        <table className="w-full min-w-[72rem] text-left text-sm">
          <thead>
            <tr className="border-b border-black/10 text-xs uppercase text-rhyze-black/45">
              <th className="w-12 p-4">#</th>
              <th>Client</th>
              <th>Status</th>
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
            {members.map((member, index) => (
              <tr key={member.id} className="border-b border-black/5 hover:bg-rhyze-gold/10">
                <td className="p-4 font-black text-rhyze-black/40">{index + 1}</td>
                <td>
                  <Link
                    href={`/admin/members/${member.id}`}
                    className="group block"
                  >
                    <strong className="block group-hover:text-rhyze-coral">
                      {member.name || 'Profile incomplete'}
                    </strong>
                    <small>{member.email}</small>
                  </Link>
                </td>
                <td>
                  <AdminStatusBadge
                    status={adminClientStatus({
                      email: member.email,
                      role: member.role,
                      accountStatus: member.status,
                      sombleStatus: member.sombleClientProfile?.sourceStatus,
                      bookingCount: clientDirectoryBookedClassCount(member),
                      hasActiveMembership: member.memberships.some((item) =>
                        ['ACTIVE', 'TRIALING'].includes(item.status),
                      ),
                      hasClaimedAccount: Boolean(member.passwordHash),
                      isSombleTransferred: Boolean(member.sombleClientProfile),
                    })}
                  />
                </td>
                <td>{date(clientDirectoryJoinedAt(member))}</td>
                <td>{date(clientDirectoryLastLoginAt(member))}</td>
                <td>{clientDirectoryWorkoutCount(member)}</td>
                <td>{member.sombleClientProfile?.appDownloaded ? 'Downloaded' : '—'}</td>
                <td>{member._count.sombleTransactions}</td>
                <td>
                  {member.memberships[0] ? (
                    <span className="font-black text-rhyze-orange">
                      {member.memberships[0].product.name}
                    </span>
                  ) : (
                    <span className="text-rhyze-black/45">No native plan</span>
                  )}
                </td>
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
