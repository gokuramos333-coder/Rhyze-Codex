import { prisma } from '@/lib/db/prisma';
import { approveInstructorAction, rejectInstructorAction } from './actions';
import Link from 'next/link';

export default async function AdminInstructorsPage() {
  const [applications, instructors] = await Promise.all([
    prisma.instructorApplication.findMany({
      include: { user: { include: { memberProfile: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { role: 'INSTRUCTOR' },
      include: { referralCodes: { where: { isActive: true }, take: 1 } },
      orderBy: { name: 'asc' },
    }),
  ]);
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">People & access</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">INSTRUCTORS</h1>
      <section className="mt-8">
        <h2 className="font-display text-4xl tracking-wider">PENDING APPROVAL</h2>
        <div className="mt-4 grid gap-3">
          {applications.filter((item) => item.status === 'PENDING').map((item) => (
            <article key={item.id} className="grid gap-4 border-l-4 border-rhyze-gold bg-white p-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div><strong className="block text-lg">{item.user.name || item.user.email}</strong><span className="text-sm text-rhyze-black/55">{item.user.email} · {item.user.memberProfile?.phone}</span></div>
              <div className="flex flex-wrap gap-2">
                <form action={approveInstructorAction}><input type="hidden" name="applicationId" value={item.id}/><button className="bg-rhyze-gradient px-4 py-3 text-xs font-black uppercase tracking-widest">Approve instructor</button></form>
                <form action={rejectInstructorAction} className="flex"><input type="hidden" name="applicationId" value={item.id}/><input name="reviewNote" placeholder="Rejection note" className="border px-3 text-sm"/><button className="border border-rhyze-coral px-4 text-xs font-black uppercase text-rhyze-coral">Reject</button></form>
              </div>
            </article>
          ))}
          {!applications.some((item) => item.status === 'PENDING') && <p className="bg-white p-6 text-rhyze-black/55">No pending instructor applications.</p>}
        </div>
      </section>
      <section className="mt-10">
        <h2 className="font-display text-4xl tracking-wider">ACTIVE INSTRUCTORS</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {instructors.map((item) => <Link href={`/admin/instructors/${item.id}`} key={item.id} className="bg-white p-5"><strong className="block font-display text-3xl tracking-wider">{item.name || item.email}</strong><span className="text-sm text-rhyze-black/55">{item.email}</span><p className="mt-3 text-xs font-black uppercase tracking-widest text-rhyze-coral">{item.referralCodes[0]?.code || 'Code pending'} · Review credentials →</p></Link>)}
        </div>
      </section>
    </>
  );
}
