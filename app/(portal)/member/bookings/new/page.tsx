import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { bookOccurrenceAction } from '../actions';
import { memberBookingDateTimeLabel } from '@/lib/domain/schedule/occurrence-display';
import { requireArea } from '@/lib/auth/session';
import { bookingWaiverDestination } from '@/lib/domain/waivers/acceptance';

export default async function NewBookingPage(
  props: {
    searchParams: Promise<{ occurrence?: string }>;
  }
) {
  const user = await requireArea('member');
  const searchParams = await props.searchParams;
  const occurrence = searchParams.occurrence
    ? await prisma.classOccurrence.findUnique({
        where: { id: searchParams.occurrence },
        include: { template: true, instructor: true, room: true },
      })
    : null;
  if (!occurrence) notFound();

  const activeWaiver = await prisma.waiverVersion.findFirst({
    where: { isActive: true, requiresSign: true },
    select: { id: true },
    orderBy: { effectiveAt: 'desc' },
  });
  const waiverAcceptance = activeWaiver
    ? await prisma.waiverAcceptance.findUnique({
        where: {
          waiverVersionId_userId: {
            waiverVersionId: activeWaiver.id,
            userId: user.id,
          },
        },
        select: { id: true },
      })
    : null;
  const missingWaiver = !activeWaiver || !waiverAcceptance;

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Confirm booking</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">{occurrence.template.name}</h1>
      <div className="mt-8 border-t-4 border-rhyze-gold bg-white p-6">
        <p className="font-bold">{memberBookingDateTimeLabel(occurrence)} · {occurrence.instructor?.name || 'TBA'}</p>
        <p className="mt-2 text-sm text-rhyze-black/55">{occurrence.room?.name || 'Room TBA'} · {occurrence.capacity} spots</p>
        {occurrence.template.isEvent && (
          <p className="mt-4 border-l-4 border-rhyze-orange bg-rhyze-orange/10 p-3 text-sm font-bold text-rhyze-black/65">
            Event credits are valid for specialty events only and expire 30 days after the cancellation that issued them.
          </p>
        )}
        {missingWaiver && (
          <div
            role="dialog"
            aria-labelledby="missing-waiver-title"
            className="mt-6 border-4 border-rhyze-coral bg-rhyze-coral/10 p-5 shadow-xl"
          >
            <p id="missing-waiver-title" className="font-display text-3xl tracking-wider text-rhyze-black">
              Missing required waivers
            </p>
            <p className="mt-3 text-sm font-bold leading-6 text-rhyze-black/70">
              Before you can book, open the waiver page, review the waiver and cancellation policy, then check the large required agreement box near the bottom and tap the signature button. We will bring you right back here to finish booking.
            </p>
            <ol className="mt-4 grid gap-2 text-sm font-bold text-rhyze-black/70 sm:grid-cols-3">
              <li className="border border-rhyze-coral/30 bg-white/80 p-3">1. Review waiver + cancellation policy</li>
              <li className="border border-rhyze-coral/30 bg-white/80 p-3">2. Check the required agreement box</li>
              <li className="border border-rhyze-coral/30 bg-white/80 p-3">3. Tap Accept and digitally sign</li>
            </ol>
            <a
              href={bookingWaiverDestination(occurrence.id)}
              className="mt-4 inline-block min-h-12 bg-rhyze-gradient px-5 py-4 text-xs font-black uppercase tracking-widest text-rhyze-black"
            >
              Review and sign waiver
            </a>
          </div>
        )}
        {!missingWaiver ? (
          <form action={bookOccurrenceAction}>
            <input type="hidden" name="occurrenceId" value={occurrence.id} />
            <button className="mt-6 bg-rhyze-gradient px-6 py-4 text-xs font-black uppercase tracking-widest">Confirm my place</button>
          </form>
        ) : (
          <button
            className="mt-6 cursor-not-allowed bg-rhyze-black/15 px-6 py-4 text-xs font-black uppercase tracking-widest text-rhyze-black/45"
            disabled
            type="button"
          >
            Waiver required before booking
          </button>
        )}
      </div>
    </>
  );
}
