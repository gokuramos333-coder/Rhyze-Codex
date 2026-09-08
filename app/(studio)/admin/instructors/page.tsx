import { prisma } from '@/lib/db/prisma';
import { approveInstructorAction, createInstructorAction, rejectInstructorAction, saveInstructorOrderAction } from './actions';
import Link from 'next/link';
import { InstructorDirectoryOrder } from '@/components/admin/InstructorDirectoryOrder';
import { InstructorInviteForm } from '@/components/admin/InstructorInviteForm';
import { uniqueClassTitles } from '@/lib/catalog/unique-class-titles';

export default async function AdminInstructorsPage(props: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const searchParams = await props.searchParams;
  const [applications, instructors] = await Promise.all([
    prisma.instructorApplication.findMany({
      include: { user: { include: { memberProfile: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({
      where: { instructorProfile: { is: { isActive: true } } },
      include: {
        instructorProfile: true,
        referralCodes: { where: { isActive: true }, take: 1 },
        classOccurrences: {
          where: { startAt: { gte: new Date() } },
          include: { template: true },
          orderBy: { startAt: 'asc' },
        },
      },
      orderBy: [{ instructorProfile: { displayOrder: 'asc' } }, { name: 'asc' }],
    }),
  ]);
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">People & access</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">INSTRUCTORS</h1>
      {searchParams.saved === 'invited' && (
        <p className="mt-5 border-l-4 border-emerald-500 bg-emerald-50 p-4 text-sm font-bold">
          Instructor invitation created. They were emailed the access steps and must enter the instructor code before approval.
        </p>
      )}
      {searchParams.error && (
        <p className="mt-5 border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-4 text-sm font-bold">
          {searchParams.error === 'exists'
            ? 'That email already belongs to an active instructor or a protected staff account.'
            : searchParams.error === 'photo'
              ? 'The photo could not be uploaded. Try again, or send the invitation without a photo.'
              : 'Enter a valid name and email address.'}
        </p>
      )}
      <InstructorInviteForm action={createInstructorAction} />
      <section className="mt-8">
        <h2 className="font-display text-4xl tracking-wider">PENDING APPROVAL</h2>
        <div className="mt-4 grid gap-3">
          {applications.filter((item) => item.status === 'PENDING').map((item) => (
            <article key={item.id} className="grid gap-4 border-l-4 border-rhyze-gold bg-white p-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div><strong className="block text-lg">{item.user.name || item.user.email}</strong><span className="text-sm text-rhyze-black/55">{item.user.email} · {item.user.memberProfile?.phone}</span></div>
              <div className="flex flex-wrap gap-2">
                <form action={approveInstructorAction}><input type="hidden" name="applicationId" value={item.id}/><button className="bg-rhyze-gradient px-4 py-3 text-xs font-black uppercase tracking-widest">Approve instructor</button></form>
                <form action={rejectInstructorAction} className="flex"><input type="hidden" name="applicationId" value={item.id}/><input name="reviewNote" placeholder="Denial note" className="border px-3 text-sm"/><button className="border border-rhyze-coral px-4 text-xs font-black uppercase text-rhyze-coral">Deny</button></form>
              </div>
            </article>
          ))}
          {!applications.some((item) => item.status === 'PENDING') && <p className="bg-white p-6 text-rhyze-black/55">No pending instructor applications.</p>}
        </div>
      </section>
      <section className="mt-10">
        <h2 className="font-display text-4xl tracking-wider">ACTIVE INSTRUCTORS</h2>
        <div className="mt-4">
          <InstructorDirectoryOrder
            action={saveInstructorOrderAction}
            initialItems={instructors.map((item) => ({
              id: item.id,
              name: item.name || item.email,
              email: item.email,
              photoUrl: item.instructorProfile?.photoUrl || null,
              classes: uniqueClassTitles(
                item.classOccurrences.map((entry) => entry.template.name),
              ),
              referralCode: item.referralCodes[0]?.code || null,
            }))}
          />
        </div>
      </section>
    </>
  );
}
