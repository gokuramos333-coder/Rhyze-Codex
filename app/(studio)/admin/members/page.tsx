import { prisma } from '@/lib/db/prisma';

export default async function AdminMembersPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim();
  const members = await prisma.user.findMany({
    where: { role: { in: ['MEMBER','INSTRUCTOR'] }, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) },
    include: { memberships: { include: { product: true } }, bookings: true, memberProfile: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Directory</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">MEMBERS</h1>
      <form className="mt-6 flex gap-2"><input name="q" defaultValue={q} placeholder="Search name or email" className="min-h-12 flex-1 border bg-white px-4"/><button className="bg-rhyze-black px-5 text-xs font-black uppercase tracking-widest text-white">Search</button></form>
      <div className="mt-8 overflow-x-auto bg-white"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-4">Member</th><th>Role</th><th>Status</th><th>Bookings</th><th>Plan</th></tr></thead><tbody>{members.map((member) => <tr key={member.id} className="border-b border-black/5"><td className="p-4"><strong className="block">{member.name || 'Profile incomplete'}</strong><small>{member.email}</small></td><td>{member.role}</td><td>{member.status}</td><td>{member.bookings.length}</td><td>{member.memberships[0]?.product.name || 'Credits / none'}</td></tr>)}</tbody></table>{members.length === 0 && <p className="p-8">No matching members.</p>}</div>
    </>
  );
}
