import { ProfileField } from '@/components/domain/accounts/ProfileField';
import Image from 'next/image';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import {
  removeProfilePhotoAction,
  updateProfilePhotoAction,
  updateNotificationPreferencesAction,
  updateProfileAction,
} from '../actions';

export default async function MemberProfilePage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string };
}) {
  const user = await requireArea('member');
  const [profile, preferences] = await Promise.all([
    prisma.memberProfile.findUnique({ where: { userId: user.id } }),
    prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
  ]);

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        Your account
      </p>

      <section className="mt-8 flex flex-wrap items-center gap-5 border-t-4 border-rhyze-gold bg-white p-6">
        <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-rhyze-black text-3xl font-black text-white">
          {profile?.photoUrl ? <Image src={profile.photoUrl} alt="" width={96} height={96} className="h-full w-full object-cover"/> : (user.name || 'R').charAt(0)}
        </div>
        <div>
          <h2 className="font-display text-3xl tracking-wider">PROFILE PHOTO</h2>
          <p className="mt-1 text-sm text-rhyze-black/55">JPG or PNG, up to 8 MB.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={updateProfilePhotoAction} className="flex flex-wrap gap-2">
              <input type="file" name="photo" accept="image/jpeg,image/png" required className="max-w-56 text-xs"/>
              <button className="bg-rhyze-black px-3 py-2 text-xs font-black uppercase text-white">Upload</button>
            </form>
            {profile?.photoUrl && <form action={removeProfilePhotoAction}><button className="border border-rhyze-coral px-3 py-2 text-xs font-black uppercase text-rhyze-coral">Remove</button></form>}
          </div>
        </div>
      </section>
      <h1 className="mt-3 font-display text-6xl tracking-wider">PROFILE</h1>
      <p className="mt-3 max-w-2xl text-rhyze-black/60">
        Keep your contact and emergency details current so the studio can
        support you when it matters.
      </p>

      {searchParams.saved && (
        <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 text-sm font-bold">
          Changes saved.
        </p>
      )}
      {searchParams.error && (
        <p className="mt-6 border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-4 text-sm font-bold">
          Enter both emergency-contact fields and check the remaining details.
        </p>
      )}

      <form
        action={updateProfileAction}
        className="mt-8 grid gap-5 border-t-4 border-rhyze-coral bg-white p-6 shadow-sm md:grid-cols-2"
      >
        <ProfileField
          label="Preferred name"
          name="preferredName"
          defaultValue={profile?.preferredName}
          autoComplete="given-name"
        />
        <ProfileField
          label="Phone"
          name="phone"
          defaultValue={profile?.phone}
          autoComplete="tel"
        />
        <ProfileField
          label="Address"
          name="addressLine1"
          defaultValue={profile?.addressLine1}
          autoComplete="address-line1"
        />
        <ProfileField
          label="Address line 2"
          name="addressLine2"
          defaultValue={profile?.addressLine2}
          autoComplete="address-line2"
        />
        <ProfileField
          label="City"
          name="city"
          defaultValue={profile?.city}
          autoComplete="address-level2"
        />
        <div className="grid grid-cols-2 gap-4">
          <ProfileField
            label="State"
            name="region"
            defaultValue={profile?.region}
            autoComplete="address-level1"
          />
          <ProfileField
            label="ZIP code"
            name="postalCode"
            defaultValue={profile?.postalCode}
            autoComplete="postal-code"
          />
        </div>
        <ProfileField
          label="Emergency contact"
          name="emergencyContactName"
          defaultValue={profile?.emergencyContactName}
        />
        <ProfileField
          label="Emergency phone"
          name="emergencyContactPhone"
          defaultValue={profile?.emergencyContactPhone}
        />
        <button className="min-h-12 bg-rhyze-black px-5 text-xs font-black uppercase tracking-[0.2em] text-rhyze-cream md:col-span-2">
          Save profile
        </button>
      </form>

      <form
        action={updateNotificationPreferencesAction}
        className="mt-6 border-t-4 border-rhyze-gold bg-white p-6 shadow-sm"
      >
        <p className="text-xs font-black uppercase tracking-[0.22em] text-rhyze-orange">
          Notifications
        </p>
        <h2 className="mt-2 font-display text-4xl tracking-wider">
          STAY IN YOUR RHYTHM
        </h2>
        <div className="mt-5 grid gap-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="classReminders"
              defaultChecked={preferences?.classReminders ?? true}
              className="mt-1 h-4 w-4 accent-rhyze-coral"
            />
            <span>
              <strong className="block">Class reminders</strong>
              <span className="text-sm text-rhyze-black/55">
                Booking and schedule reminders for classes you reserve.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="marketingEmail"
              defaultChecked={preferences?.marketingEmail ?? true}
              className="mt-1 h-4 w-4 accent-rhyze-coral"
            />
            <span>
              <strong className="block">Studio news and offers</strong>
              <span className="text-sm text-rhyze-black/55">
                Optional announcements, events, and promotions.
              </span>
            </span>
          </label>
        </div>
        <p className="mt-4 text-xs text-rhyze-black/45">
          Receipts, security messages, and booking confirmations are always
          sent when required.
        </p>
        <button className="mt-5 min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-[0.2em]">
          Save notifications
        </button>
      </form>
    </>
  );
}
