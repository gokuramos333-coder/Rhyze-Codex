import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

async function publishWaiverAction(formData: FormData) {
  'use server';
  const actor = await requireArea('admin');
  const title = String(formData.get('title') || '').trim();
  const body = String(formData.get('body') || '').trim();
  if (title.length < 3 || body.length < 50) redirect('/admin/waivers?error=invalid');

  await prisma.$transaction(async (tx) => {
    await tx.waiverVersion.updateMany({ where: { isActive: true }, data: { isActive: false } });
    const latest = await tx.waiverVersion.aggregate({ _max: { version: true } });
    const waiver = await tx.waiverVersion.create({
      data: {
        version: (latest._max.version || 0) + 1,
        title,
        body,
        effectiveAt: new Date(),
        isActive: true,
        requiresSign: true,
      },
    });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: 'waiver.published', entityType: 'WaiverVersion', entityId: waiver.id },
    });
  });
  revalidatePath('/admin/waivers');
  revalidatePath('/member/waiver');
  redirect('/admin/waivers?saved=1');
}

export default async function AdminWaiversPage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const versions = await prisma.waiverVersion.findMany({ orderBy: { version: 'desc' } });
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Policies</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">WAIVERS</h1>
      <p className="mt-3 max-w-3xl text-rhyze-black/60">
        Publish only text reviewed and approved by Rhyze’s legal advisor. A new active version requires every member to sign again.
      </p>
      {searchParams.saved && <p className="mt-5 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">New waiver version published.</p>}
      <form action={publishWaiverAction} className="mt-8 grid gap-4 border-t-4 border-rhyze-coral bg-white p-6">
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-widest">Waiver title</span>
          <input name="title" required className="min-h-12 border px-3" />
        </label>
        <label className="grid gap-2">
          <span className="text-xs font-black uppercase tracking-widest">Approved waiver text</span>
          <textarea name="body" required className="min-h-64 border p-3" />
        </label>
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest">Publish new required version</button>
      </form>
      <div className="mt-8 grid gap-3">
        {versions.map((version) => (
          <article key={version.id} className="bg-white p-5">
            <strong>Version {version.version}: {version.title}</strong>
            <span className="ml-3 text-xs font-black uppercase tracking-widest text-rhyze-coral">{version.isActive ? 'Active' : 'Superseded'}</span>
          </article>
        ))}
      </div>
    </>
  );
}
