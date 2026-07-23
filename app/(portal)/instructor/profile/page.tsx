import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';

export default async function InstructorProfilePage() {
  const user = await requireArea('instructor');
  const profile = await prisma.instructorProfile.findUnique({ where: { userId: user.id } });
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Public instructor identity</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">MY PROFILE</h1>
      <div className="mt-8 max-w-2xl border-t-4 border-rhyze-gold bg-white p-6">
        <p className="text-xs font-black uppercase tracking-widest">Name</p><p className="mt-2 text-xl font-bold">{user.name || 'Name not set'}</p>
        <p className="mt-6 text-xs font-black uppercase tracking-widest">Bio</p><p className="mt-2 text-rhyze-black/60">{profile?.bio || 'Ask an owner or manager to add your public instructor bio and photo.'}</p>
      </div>
    </>
  );
}
