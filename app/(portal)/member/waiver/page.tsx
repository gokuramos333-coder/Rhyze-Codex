import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { acceptWaiverAction } from '../actions';
import { PrintAgreementButton } from '@/components/member/print-agreement-button';

export default async function MemberWaiverPage({
  searchParams,
}: {
  searchParams: { error?: string; saved?: string };
}) {
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
              <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">
                Version {activeWaiver.version}
              </p>
              <h2 className="mt-2 font-display text-4xl tracking-wider">
                {activeWaiver.title}
              </h2>
            </div>
            <span className="bg-rhyze-black px-3 py-1 text-xs font-black uppercase tracking-widest text-rhyze-cream">
              {acceptance ? 'Signed' : 'Signature needed'}
            </span>
          </div>
          <div className="mt-6 max-h-96 overflow-y-auto whitespace-pre-wrap border border-rhyze-black/10 bg-[#f8f5ed] p-5 text-sm leading-7">
            {activeWaiver.body}
          </div>

          {acceptance ? (
            <p className="mt-5 text-sm font-bold text-emerald-700">
              Accepted {acceptance.acceptedAt.toLocaleString('en-US', {
                timeZone: 'America/New_York',
              })}
            </p>
          ) : (
            <form action={acceptWaiverAction} className="mt-5">
              <input
                type="hidden"
                name="waiverVersionId"
                value={activeWaiver.id}
              />
              <label className="flex items-start gap-3">
                <input
                  required
                  type="checkbox"
                  name="accepted"
                  className="mt-1 h-4 w-4 accent-rhyze-coral"
                />
                <span className="text-sm font-bold">
                  I have read and agree to the complete studio waiver and policies shown above.
                </span>
              </label>
              <label className="mt-4 flex items-start gap-3 border border-rhyze-orange/30 bg-orange-50 p-4">
                <input
                  type="checkbox"
                  name="mediaConsent"
                  className="mt-1 h-4 w-4 accent-rhyze-coral"
                />
                <span className="text-sm">
                  <strong className="block">Optional media permission</strong>
                  Rhyze may use photos or videos in which I appear for studio marketing. Declining does not affect booking.
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
                  Review the current waiver and confirm your acceptance.
                </p>
              )}
              <button className="mt-5 min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-[0.2em]">
                Accept and digitally sign
              </button>
              <PrintAgreementButton />
            </form>
          )}
        </article>
      )}
    </>
  );
}
