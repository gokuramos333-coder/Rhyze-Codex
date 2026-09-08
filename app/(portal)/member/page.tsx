import Link from 'next/link';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import {
  introTrialCreditCountdownMessage,
  introTrialDaysRemaining,
  introTrialIsExpired,
} from '@/lib/domain/memberships/membership-display';
import {
  ATTENDED_RECORD_STATUSES,
  creditAccountCanBook,
} from '@/lib/domain/bookings/booking-rules';
import { memberBookingDateTimeLabel } from '@/lib/domain/schedule/occurrence-display';
import { availableMembershipCredits } from '@/lib/domain/credits/membership-renewal';
import {
  availableCreditSummary,
  classCreditDisplayLabel,
} from '@/lib/domain/credits/credit-balances';
import { giftedVipAccessNote } from '@/lib/domain/memberships/gifted-vip';

export default async function MemberHomePage() {
  const user = await requireArea('member');
  const now = new Date();
  const [upcoming, pastCount, credits, memberships, firstTrialBooking] = await Promise.all([
    prisma.booking.findMany({ where: { userId: user.id, status: 'CONFIRMED', occurrence: { startAt: { gte: new Date() } } }, include: { occurrence: { include: { template: true, instructor: true, room: true } } }, orderBy: { occurrence: { startAt: 'asc' } }, take: 3 }),
    prisma.attendanceRecord.count({
      where: { userId: user.id, status: { in: ATTENDED_RECORD_STATUSES } },
    }),
    prisma.creditAccount.findMany({
      where: {
        userId: user.id,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
      },
      include: {
        entries: true,
        sourcePurchase: {
          include: {
            membership: { select: { status: true, activatedAt: true, currentPeriodEnd: true } },
            product: { select: { includedCredits: true, kind: true } },
          },
        },
      },
    }),
    prisma.membership.findMany({
      where: { userId: user.id, status: { in: ['ACTIVE', 'TRIALING', 'PAUSED', 'PAST_DUE'] } },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.booking.findFirst({
      where: {
        userId: user.id,
        status: { in: ['CONFIRMED', 'ATTENDED'] },
        policySnapshot: { path: ['accessType'], equals: 'INTRO_TRIAL' },
        occurrence: { template: { isEvent: false } },
      },
      select: { occurrence: { select: { startAt: true } } },
      orderBy: { occurrence: { startAt: 'asc' } },
    }),
  ]);
  const firstTrialClassAt = firstTrialBooking?.occurrence.startAt ?? null;
  const currentMembership = memberships.find((membership) =>
    membership.product.kind !== 'INTRO_TRIAL' ||
    !introTrialIsExpired({
      activatedAt: membership.activatedAt,
      currentPeriodEnd: membership.currentPeriodEnd,
      firstClassAt: firstTrialClassAt,
      now,
    }),
  );
  const latestExpiredIntroTrial = memberships.find((membership) =>
    membership.product.kind === 'INTRO_TRIAL' &&
    introTrialIsExpired({
      activatedAt: membership.activatedAt,
      currentPeriodEnd: membership.currentPeriodEnd,
      firstClassAt: firstTrialClassAt,
      now,
    }),
  );
  const creditBalances = availableCreditSummary(credits
    .filter((account) => {
      const membership = account.sourcePurchase?.membership;
      if (
        account.sourcePurchase?.product.kind === 'INTRO_TRIAL' &&
        introTrialIsExpired({
          activatedAt: membership?.activatedAt ?? null,
          currentPeriodEnd: membership?.currentPeriodEnd ?? null,
          firstClassAt: firstTrialClassAt,
          now,
        })
      ) {
        return false;
      }
      return creditAccountCanBook({ membershipStatus: membership?.status ?? null });
    })
    .map((account) => ({
      label: account.label,
      isUnlimited: account.isUnlimited,
      available: availableMembershipCredits({
          entries: account.entries,
          includedCredits: account.sourcePurchase?.product.includedCredits ?? null,
      }),
    })));
  const classCreditLabel = classCreditDisplayLabel(
    creditBalances,
    currentMembership?.product.kind,
  );
  const trialDays = currentMembership?.product.kind === 'INTRO_TRIAL'
    ? introTrialDaysRemaining({ activatedAt: currentMembership.activatedAt, currentPeriodEnd: currentMembership.currentPeriodEnd, firstClassAt: firstTrialClassAt, now })
    : null;
  const trialCreditNote = currentMembership?.product.kind === 'INTRO_TRIAL'
    ? introTrialCreditCountdownMessage(trialDays)
    : latestExpiredIntroTrial && !currentMembership
      ? 'Trial expired'
      : null;
  const giftedVipNote = giftedVipAccessNote(currentMembership?.product.slug);
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Member home</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider md:text-8xl">WELCOME, {(user.name || 'Rhyzer').split(' ')[0].toUpperCase()}</h1>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/member/bookings" className="border-t-4 border-rhyze-orange bg-white p-5"><p className="text-xs font-black uppercase tracking-widest">Classes booked</p><p className="mt-3 font-display text-5xl">{upcoming.length}</p><span className="mt-3 block text-[10px] font-black uppercase tracking-widest text-rhyze-coral">View bookings →</span></Link>
        <Link href="/member/membership" className="border-t-4 border-rhyze-gold bg-white p-5"><p className="text-xs font-black uppercase tracking-widest">Available class credits</p><p className={`mt-3 font-display ${creditBalances.hasUnlimitedClassAccess ? 'text-2xl leading-tight' : 'text-5xl'}`}>{classCreditLabel}</p>{trialCreditNote && <span className="mt-3 block text-sm font-black text-rhyze-coral">{trialCreditNote}</span>}</Link>
        <Link href="/member/membership" className="border-t-4 border-rhyze-orange bg-white p-5"><p className="text-xs font-black uppercase tracking-widest">Available event credits</p><p className="mt-3 font-display text-5xl">{creditBalances.eventCredits}</p></Link>
        <Link href="/member/bookings" className="border-t-4 border-rhyze-coral bg-white p-5"><p className="text-xs font-black uppercase tracking-widest">Classes attended</p><p className="mt-3 font-display text-5xl">{pastCount}</p></Link>
      </div>
      <Link href="/member/membership" className="mt-3 flex flex-wrap items-center justify-between gap-4 border-l-4 border-rhyze-coral bg-white p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">Current membership</p>
          <strong className="mt-1 block font-display text-3xl tracking-wider">{currentMembership?.product.name || 'No active plan'}</strong>
          <span className="text-xs font-bold uppercase text-rhyze-black/45">{currentMembership?.status.replaceAll('_', ' ') || 'Explore memberships'}</span>
          {giftedVipNote && <p className="mt-2 text-sm font-bold text-rhyze-coral">{giftedVipNote}</p>}
        </div>
        {(currentMembership?.product.kind === 'INTRO_TRIAL' || (!currentMembership && latestExpiredIntroTrial)) && (
          <strong className="bg-orange-50 px-4 py-3 text-sm">
            {!currentMembership && latestExpiredIntroTrial
              ? 'Trial expired'
              : trialDays === null ? 'Starts with your first booking' : `${trialDays} day${trialDays === 1 ? '' : 's'} left`}
          </strong>
        )}
      </Link>
      <div className="mt-10 flex items-end justify-between gap-4"><h2 className="font-display text-4xl tracking-wider">UP NEXT</h2><Link href="/schedule" className="text-xs font-black uppercase tracking-widest text-rhyze-coral">Browse schedule →</Link></div>
      <div className="mt-4 grid gap-3">{upcoming.map((booking) => <Link key={booking.id} href="/member/bookings" className="bg-white p-5"><strong className="block font-display text-3xl tracking-wider">{booking.occurrence.template.name}</strong><small>{memberBookingDateTimeLabel(booking.occurrence)} · {booking.occurrence.instructor?.name || 'TBA'}</small><small className="mt-1 block uppercase tracking-wider text-rhyze-black/45">{booking.occurrence.room?.name || 'Room TBA'} · {booking.occurrence.template.durationMinutes} min</small></Link>)}{upcoming.length === 0 && <p className="bg-white p-8 text-rhyze-black/55">Nothing booked yet. Your next class is waiting.</p>}</div>
    </>
  );
}
