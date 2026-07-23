import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { uploadCredentialAction } from './actions';

export default async function InstructorProfilePage({ searchParams }: { searchParams: { saved?: string; error?: string } }) {
  const user = await requireArea('instructor');
  const [profile, credentials, code] = await Promise.all([
    prisma.instructorProfile.findUnique({ where: { userId: user.id } }),
    prisma.instructorCredential.findMany({ where: { instructorId: user.id }, orderBy: { createdAt: 'desc' } }),
    prisma.referralCode.findFirst({ where: { instructorId: user.id, isActive: true } }),
  ]);
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Instructor identity & compliance</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">MY PROFILE</h1>
      {searchParams.saved && <p className="mt-5 border-l-4 border-rhyze-gold bg-white p-4 font-bold">Document uploaded for admin review.</p>}
      {searchParams.error && <p className="mt-5 border-l-4 border-rhyze-coral bg-white p-4 font-bold text-rhyze-coral">Use a valid PDF, JPG, or PNG. If provided, the expiration date must be in the future.</p>}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section className="border-t-4 border-rhyze-gold bg-white p-6"><p className="text-xs font-black uppercase tracking-widest">Name</p><p className="mt-2 text-xl font-bold">{user.name || 'Name not set'}</p><p className="mt-6 text-xs font-black uppercase tracking-widest">Bio</p><p className="mt-2 text-rhyze-black/60">{profile?.bio || 'Your public bio can be completed with the studio.'}</p></section>
        <section className="border-t-4 border-rhyze-coral bg-white p-6"><p className="text-xs font-black uppercase tracking-widest">Referral code</p><p className="mt-3 font-display text-5xl tracking-wider">{code?.code || 'PENDING'}</p><p className="mt-2 text-sm text-rhyze-black/55">Your dashboard includes copy controls and earnings.</p></section>
      </div>
      <section className="mt-6 border-t-4 border-rhyze-orange bg-white p-6">
        <h2 className="font-display text-4xl tracking-wider">REQUIRED DOCUMENTS</h2>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">{(['INSURANCE','CPR'] as const).map((type) => {
          const latest = credentials.find((item) => item.type === type);
          return (
            <form
              key={type}
              action={uploadCredentialAction}
              className="grid gap-3 border border-rhyze-orange/30 bg-orange-100 p-5 text-black"
            >
              <input type="hidden" name="type" value={type}/>
              <strong>{type === 'CPR' ? 'CPR Certification' : 'Instructor Insurance'}</strong>
              <p className="text-xs text-black/65">
                {latest
                  ? `${latest.status} · ${latest.expiresAt ? `expires ${latest.expiresAt.toLocaleDateString()}` : 'No expiration date provided'}`
                  : 'Missing'}
              </p>
              <input type="file" name="document" accept=".pdf,image/jpeg,image/png" required className="text-sm text-black"/>
              <label className="grid gap-1 text-xs font-bold uppercase">
                Expiration date <span className="normal-case text-black/55">(optional)</span>
                <input type="date" name="expiresAt" className="min-h-11 border border-rhyze-orange/40 bg-orange-50 px-3 text-sm font-normal text-black"/>
              </label>
              <button className="bg-rhyze-black px-4 py-3 text-xs font-black uppercase text-white">Upload for review</button>
            </form>
          );
        })}</div>
      </section>
    </>
  );
}
