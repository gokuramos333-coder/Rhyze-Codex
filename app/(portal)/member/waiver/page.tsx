import Link from 'next/link';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { acceptWaiverAction } from '../actions';
import { PrintAgreementButton } from '@/components/member/print-agreement-button';
import { waiverCompletionDestination } from '@/lib/domain/waivers/acceptance';

export default async function MemberWaiverPage(
  props: {
    searchParams: Promise<{ error?: string; saved?: string; returnTo?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await requireArea('member');
  const activeWaiver = await prisma.waiverVersion.findFirst({
    where: { isActive: true },
    orderBy: { effectiveAt: 'desc' },
    include: {
      acceptances: {
        where: { userId: user.id },
        select: { acceptedAt: true },
      },
    },
  });
  const acceptance = activeWaiver?.acceptances[0];
  const completionDestination = waiverCompletionDestination(searchParams.returnTo);

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        Required before booking
      </p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">
        STUDIO WAIVER
      </h1>

      {!activeWaiver && (
        <div className="mt-8 border-t-4 border-rhyze-gold bg-white p-6 shadow-sm">
          <h2 className="font-display text-4xl tracking-wider">
            NO WAIVER PUBLISHED
          </h2>
          <p className="mt-3 text-rhyze-black/60">
            The studio has not published its approved waiver yet. Booking stays
            locked until an owner publishes the legally reviewed version.
          </p>
        </div>
      )}

      {activeWaiver && (
        <article className="mt-8 border-t-4 border-rhyze-coral bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-4xl tracking-wider">
                {activeWaiver.title}
              </h2>
              {!acceptance && (
                <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-rhyze-black/70">
                  Please scroll/read the agreement below, including the cancellation policy, then complete the highlighted signature box. The required checkbox is large and outlined so it is easy to find.
                </p>
              )}
            </div>
            <span className="bg-rhyze-black px-3 py-1 text-xs font-black uppercase tracking-widest text-rhyze-cream">
              {acceptance ? 'Signed' : 'Signature needed'}
            </span>
          </div>
          {!acceptance && searchParams.returnTo && (
            <div className="mt-5 border-2 border-rhyze-gold bg-rhyze-gold/10 p-4 text-sm font-bold leading-6 text-rhyze-black/75">
              Booking is waiting on this step: review the waiver + cancellation policy, check the required agreement box below, then tap “Accept waiver and cancellation policy” to return to booking.
            </div>
          )}
          <div className="mt-6 max-h-96 overflow-y-auto whitespace-pre-wrap border border-rhyze-black/10 bg-[#f8f5ed] p-5 text-sm leading-7">
            {activeWaiver.body}
          </div>

          {acceptance ? (
            <div className="mt-5">
              <p className="text-sm font-bold text-emerald-700">
                Accepted {acceptance.acceptedAt.toLocaleString('en-US', {
                  timeZone: 'America/New_York',
                })}
              </p>
              {searchParams.returnTo && (
                <Link
                  href={completionDestination}
                  className="mt-5 inline-block min-h-12 bg-rhyze-gradient px-5 py-4 text-xs font-black uppercase tracking-[0.2em]"
                >
                  Continue to booking
                </Link>
              )}
            </div>
          ) : (
            <form action={acceptWaiverAction} className="mt-6 border-4 border-rhyze-coral bg-rhyze-coral/10 p-5 shadow-xl">
              <input
                type="hidden"
                name="waiverVersionId"
                value={activeWaiver.id}
              />
              <input
                type="hidden"
                name="redirectTo"
                value={completionDestination}
              />
              <p className="text-xs font-black uppercase tracking-[0.25em] text-rhyze-coral">
                Required signature box
              </p>
              <h3 className="mt-2 font-display text-3xl tracking-wider">
                Check this box to sign
              </h3>
              <label className="mt-4 flex cursor-pointer items-start gap-4 border-2 border-rhyze-coral bg-white p-4 shadow-sm">
                <input
                  required
                  type="checkbox"
                  name="accepted"
                  className="mt-1 h-7 w-7 shrink-0 accent-rhyze-coral"
                />
                <span className="text-base font-black leading-7">
                  I have read and agree to the complete Rhyze Fitness waiver, electronic signature terms, and cancellation policy shown above.
                </span>
              </label>
              <label className="mt-4 flex items-start gap-3 border border-rhyze-orange/30 bg-orange-50 p-4">
                <input
                  type="checkbox"
                  name="mediaConsent"
                  className="mt-1 h-4 w-4 accent-rhyze-coral"
                />
                <span className="text-sm">
                  <strong className="block">Optional media consent</strong>
                  I give Rhyze Fitness permission to photograph or record me and use my image or likeness for its website, social media, advertising, and promotional materials. I understand that I will not be paid and may withdraw permission for future use by contacting Rhyze Fitness. Leaving this option unchecked will not affect my membership, booking, or class participation.
                </span>
              </label>
              <label className="mt-4 grid max-w-xs gap-2 text-xs font-black uppercase tracking-widest">
                Signing date
                <input
                  required
                  type="date"
                  name="signedDate"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="min-h-11 border border-rhyze-black/20 bg-white px-3 text-sm font-normal"
                />
              </label>
              {searchParams.error && (
                <p className="mt-3 text-sm font-bold text-rhyze-coral">
                  Review the current waiver and cancellation policy, then check the required agreement box.
                </p>
              )}
              <button className="mt-5 min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-[0.2em]">
                Accept waiver and cancellation policy
              </button>
              <PrintAgreementButton />
            </form>
          )}
        </article>
      )}
    </>
  );
}
