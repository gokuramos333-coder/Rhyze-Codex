import Link from 'next/link';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { BirthdayFields } from '@/components/domain/accounts/BirthdayFields';
import { InstructorPublicProfileForm } from '@/components/admin/InstructorPublicProfileForm';
import {
  updateInstructorBirthdayAction,
  updateOwnInstructorDirectoryAction,
  uploadCredentialAction,
} from './actions';

export default async function InstructorProfilePage(props: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await requireArea('instructor');
  const [profile, memberProfile, credentials, code] = await Promise.all([
    prisma.instructorProfile.findUnique({ where: { userId: user.id } }),
    prisma.memberProfile.findUnique({ where: { userId: user.id } }),
    prisma.instructorCredential.findMany({ where: { instructorId: user.id }, orderBy: { createdAt: 'desc' } }),
    prisma.referralCode.findFirst({ where: { instructorId: user.id, isActive: true } }),
  ]);
  const isOwnerInstructor = ['vanessa@rhyzefit.com', 'melissa@rhyzefit.com'].includes(user.email.toLowerCase());
  const standardRateCents = isOwnerInstructor ? 0 : (profile?.standardClassRateCents ?? 4_000);
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Instructor identity & compliance</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">MY PROFILE</h1>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/instructor/profile#credentials" className="border border-rhyze-orange bg-orange-50 px-4 py-3 text-xs font-black uppercase tracking-widest">Upload credentials</Link>
        <Link href="/instructor/referrals" className="bg-rhyze-black px-4 py-3 text-xs font-black uppercase tracking-widest text-white">Referral commissions</Link>
      </div>
      {searchParams.saved && <p className="mt-5 border-l-4 border-rhyze-gold bg-white p-4 font-bold">{searchParams.saved === 'birthday' ? 'Birthday saved.' : searchParams.saved === 'profile' ? 'Your public instructor profile is updated.' : 'Document uploaded for admin review.'}</p>}
      {searchParams.error && searchParams.error !== 'photo' && <p className="mt-5 border-l-4 border-rhyze-coral bg-white p-4 font-bold text-rhyze-coral">{searchParams.error === 'birthday' ? 'Choose a valid birthday month and day.' : searchParams.error === 'profile-access' ? 'Ask Rhyze Admin to enable profile editing for your account.' : searchParams.error === 'profile' ? 'Enter your public instructor name.' : 'Use a valid PDF, JPG, or PNG. If provided, the expiration date must be in the future.'}</p>}
      {profile?.canEditOwnProfile && (
        <div className="mt-8">
          <InstructorPublicProfileForm
            action={updateOwnInstructorDirectoryAction}
            name={user.name || ''}
            bio={profile.bio || ''}
            currentPhotoUrl={profile.photoUrl}
            initialPhotoError={searchParams.error === 'photo'
              ? 'Use a HEIC, HEIF, JPG, PNG, or WebP image no larger than 8 MB.'
              : null}
            submitLabel="Save and publish my profile"
          />
        </div>
      )}
      <Link href="/instructor/referrals" className="mt-6 block border-t-4 border-rhyze-coral bg-white p-6 transition hover:-translate-y-0.5 hover:shadow-lg"><p className="text-xs font-black uppercase tracking-widest">Referral code</p><p className="mt-3 font-display text-5xl tracking-wider">{code?.code || 'PENDING'}</p><p className="mt-2 text-sm text-rhyze-black/55">Open copy controls, referred clients, and commission details →</p></Link>
      <section className="mt-6 border-t-4 border-rhyze-coral bg-white p-6">
        <h2 className="font-display text-4xl tracking-wider">BIRTHDAY</h2>
        <form action={updateInstructorBirthdayAction} className="mt-4 grid max-w-xl gap-4">
          <BirthdayFields value={memberProfile?.dateOfBirth} />
          <button className="bg-rhyze-black px-4 py-3 text-xs font-black uppercase text-white">Save birthday</button>
        </form>
      </section>
      <section className="mt-6 border-t-4 border-rhyze-gold bg-white p-6">
        <h2 className="font-display text-4xl tracking-wider">PAY RATES</h2>
        <p className="mt-2 text-sm text-rhyze-black/55">Rates are set and maintained by Rhyze Admin.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="bg-orange-50 p-5">
            <p className="text-xs font-black uppercase tracking-widest">Standard Classes</p>
            <p className="mt-2 font-display text-5xl">${(standardRateCents / 100).toFixed(2)}</p>
          </div>
          <div className="bg-orange-50 p-5">
            <p className="text-xs font-black uppercase tracking-widest">Specialty Events</p>
            <p className="mt-2 whitespace-pre-wrap text-lg font-black leading-7">{profile?.specialtyEventRateText || (profile?.specialtyEventRateCents == null ? 'Not set' : `$${(profile.specialtyEventRateCents / 100).toFixed(2)}`)}</p>
          </div>
        </div>
      </section>
      <section id="credentials" className="mt-6 scroll-mt-24 border-t-4 border-rhyze-orange bg-white p-6">
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
