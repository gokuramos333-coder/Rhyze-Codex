import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { acceptWaiverAction } from '@/app/(portal)/member/actions';

function studioDateValue(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [
      part.type,
      part.value,
    ]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export async function AgreementProfileCard({
  userId,
  returnTo,
}: {
  userId: string;
  returnTo: '/member/profile' | '/instructor/profile';
}) {
  const activeWaiver = await prisma.waiverVersion.findFirst({
    where: { isActive: true, requiresSign: true },
    orderBy: { effectiveAt: 'desc' },
    include: {
      acceptances: {
        where: { userId },
        select: { acceptedAt: true, signedDate: true },
        take: 1,
      },
    },
  });
  const acceptance = activeWaiver?.acceptances[0];

  return (
    <section className="mt-6 border-t-4 border-rhyze-orange bg-orange-50 p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-rhyze-orange">
        Required studio agreement
      </p>
      <h2 className="mt-2 font-display text-4xl tracking-wider">
        POLICIES & DIGITAL SIGNATURE
      </h2>
      {!activeWaiver && (
        <p className="mt-4 font-bold text-rhyze-coral">
          The studio agreement is awaiting publication.
        </p>
      )}
      {activeWaiver && acceptance && (
        <div className="mt-4 border border-emerald-700/20 bg-emerald-50 p-4">
          <strong className="text-emerald-800">Complete</strong>
          <p className="mt-1 text-sm text-rhyze-black/65">
            Digitally signed and dated{' '}
            {acceptance.signedDate.toLocaleDateString('en-US', {
              timeZone: 'America/New_York',
            })}
            . A new signature will be required after a material policy update.
          </p>
          <Link
            href="/member/waiver"
            className="mt-3 inline-block text-xs font-black uppercase tracking-widest text-rhyze-coral"
          >
            Review signed agreement →
          </Link>
        </div>
      )}
      {activeWaiver && !acceptance && (
        <>
          <p className="mt-3 max-w-2xl text-sm text-rhyze-black/65">
            Review the complete waiver and studio policies before signing.
            Booking remains unavailable until this required agreement is complete.
          </p>
          <Link
            href="/member/waiver"
            className="mt-4 inline-block text-xs font-black uppercase tracking-widest text-rhyze-coral"
          >
            Review the complete agreement →
          </Link>
          <form action={acceptWaiverAction} className="mt-5 grid gap-4">
            <input type="hidden" name="waiverVersionId" value={activeWaiver.id}/>
            <input type="hidden" name="redirectTo" value={returnTo}/>
            <label className="flex items-start gap-3">
              <input required type="checkbox" name="accepted" className="mt-1 h-4 w-4 accent-rhyze-coral"/>
              <span className="text-sm font-bold">
                I reviewed and agree to the current Rhyze Fitness waiver and studio policies.
              </span>
            </label>
            <label className="grid max-w-xs gap-2 text-xs font-black uppercase tracking-widest">
              Signing date
              <input
                required
                type="date"
                name="signedDate"
                defaultValue={studioDateValue()}
                className="min-h-11 border border-rhyze-orange/30 bg-white px-3 text-sm font-normal"
              />
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="mediaConsent" className="mt-1 h-4 w-4 accent-rhyze-coral"/>
              <span>
                <strong className="block">Optional media consent</strong>
                I give Rhyze Fitness permission to photograph or record me and use my image or likeness for its website, social media, advertising, and promotional materials. I understand that I will not be paid and may withdraw permission for future use by contacting Rhyze Fitness. Leaving this option unchecked will not affect my membership, booking, or class participation.
              </span>
            </label>
            <button className="min-h-12 max-w-sm bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-[0.2em]">
              Agree and digitally sign
            </button>
          </form>
        </>
      )}
    </section>
  );
}
