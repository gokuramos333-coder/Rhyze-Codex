import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { reviewCredentialAction } from './actions';

export default async function InstructorReviewPage({ params }: { params: { userId: string } }) {
  const instructor = await prisma.user.findFirst({
    where: { id: params.userId, role: 'INSTRUCTOR' },
    include: { instructorCredentials: { orderBy: { createdAt: 'desc' } }, referralCodes: { where: { isActive: true }, take: 1 } },
  });
  if (!instructor) notFound();
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Credential review</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">{instructor.name || 'INSTRUCTOR'}</h1>
      <p className="mt-3 text-rhyze-black/55">{instructor.email} · {instructor.referralCodes[0]?.code}</p>
      <div className="mt-8 grid gap-3">
        {instructor.instructorCredentials.map((item) => (
          <article key={item.id} className="grid gap-4 bg-white p-5 lg:grid-cols-[1fr_auto]">
            <div><strong className="block">{item.type === 'CPR' ? 'CPR Certification' : 'Instructor Insurance'}</strong><span className="text-sm text-rhyze-black/55">{item.status} · {item.expiresAt ? `expires ${item.expiresAt.toLocaleDateString()}` : 'no expiration date provided'}</span><Link href={`/api/credentials/${item.id}`} className="mt-2 block text-xs font-black uppercase text-rhyze-coral">Private download</Link></div>
            <div className="flex flex-wrap gap-2">
              <form action={reviewCredentialAction}><input type="hidden" name="credentialId" value={item.id}/><input type="hidden" name="status" value="VALID"/><button className="bg-rhyze-black px-4 py-3 text-xs font-black uppercase text-white">Approve</button></form>
              <form action={reviewCredentialAction} className="flex"><input type="hidden" name="credentialId" value={item.id}/><input type="hidden" name="status" value="REJECTED"/><input name="rejectionNote" placeholder="Reason" className="border px-3 text-sm"/><button className="border border-rhyze-coral px-4 text-xs font-black uppercase text-rhyze-coral">Reject</button></form>
            </div>
          </article>
        ))}
        {instructor.instructorCredentials.length === 0 && <p className="bg-white p-8 text-rhyze-black/55">No credentials uploaded yet.</p>}
      </div>
    </>
  );
}
