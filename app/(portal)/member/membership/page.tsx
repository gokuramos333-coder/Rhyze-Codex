import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { startCheckoutAction } from './actions';
import {
  isProductActiveInWindow,
  isProductAvailable,
  productAvailabilityMessage,
} from '@/lib/catalog/product-availability';
import { isReferralEligibleProduct } from '@/lib/domain/referrals/referral-service';
import {
  introTrialCreditCountdownMessage,
  introTrialDaysRemaining,
  introTrialIsExpired,
} from '@/lib/domain/memberships/membership-display';
import { creditAccountCanBook } from '@/lib/domain/bookings/booking-rules';
import { MembershipChangeRequestForm } from '@/components/memberships/MembershipChangeRequestForm';
import { availableMembershipCredits } from '@/lib/domain/credits/membership-renewal';
import {
  availableCreditSummary,
  classCreditDisplayLabel,
} from '@/lib/domain/credits/credit-balances';
import {
  PRIVATE_OG_RHYZE_SLUG,
  canAccessPrivateMembership,
} from '@/lib/catalog/private-membership';
import { giftedVipAccessNote } from '@/lib/domain/memberships/gifted-vip';
import { TrialPolicyConsent } from '@/components/memberships/TrialPolicyConsent';
import { productCheckoutCadence } from '@/lib/catalog/product-cadence';
import {
  membershipPromoCodeInputHelp,
  removeExpiredRhyze2026PromoCopy,
} from '@/lib/domain/memberships/rhyze-2026-promo';

const resultMessages: Record<string, string> = {
  stripe: 'This plan is ready, but secure payments are not connected yet. Please contact the studio.',
  success: 'Thanks! Stripe is confirming your purchase now.',
  processing: 'Your payment is confirmed and your access is still syncing. Please refresh this page in a moment.',
  cancelled: 'Checkout cancelled—nothing was charged.',
  unavailable: 'That plan is no longer available.',
  'trial-ineligible': 'The 7-day intro trial is available once to first-time Rhyze clients only.',
  'trial-policy': 'Review and accept the intro-trial cancellation and no-show policy before checkout.',
  'referral-invalid': 'That instructor referral code is not active. Check the code and try again.',
  'referral-used': 'Only one promo code can be used per new customer—choose either an instructor referral code or the Labor Day sale code.',
  'referral-ineligible': 'Referral codes apply to paid monthly memberships and the $25 single class, but not the $7 intro offer.',
  'rhyze2026-expired': 'RHYZE2026 is only available September 1–7, 2026.',
  'rhyze2026-ineligible': 'RHYZE2026 is valid only for paid memberships. It does not apply to class packs, single classes, events, or the 7-day trial.',
  'rhyze2026-current-member': 'RHYZE2026 is for members who do not already have an active membership.',
  requested: 'Your request was sent to Admin. Your current plan stays active until management reviews it.',
  'request-pending': 'This membership already has a request waiting for management review.',
  'request-invalid': 'Choose a valid plan change or cancellation request.',
  'checkout-error': 'Secure checkout could not start. Nothing was charged. Please try again or contact the studio.',
};

function date(value: Date | null) {
  return value
    ? value.toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'America/New_York' })
    : 'Ongoing';
}

export default async function MemberMembershipPage(props: { searchParams: Promise<{ result?: string; plan?: string; privatePlan?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await requireArea('member');
  const now = new Date();
  const [products, memberships, credits, firstTrialBooking] = await Promise.all([
    prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { isPublic: true },
          ...(searchParams.privatePlan === PRIVATE_OG_RHYZE_SLUG
            ? [{ isPublic: false, slug: PRIVATE_OG_RHYZE_SLUG }]
            : []),
        ],
        AND: [{ OR: [
          { alwaysAvailable: true },
          { availabilityEnd: null },
          { availabilityEnd: { gte: now } },
        ] }],
      },
      orderBy: [{ displayOrder: 'asc' }, { priceCents: 'asc' }],
    }),
    prisma.membership.findMany({
      where: { userId: user.id },
      include: {
        product: true,
        freezes: { where: { cancelledAt: null }, orderBy: { startAt: 'desc' }, take: 5 },
        changeRequests: {
          where: { status: 'PENDING' },
          include: { requestedProduct: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
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
  const displayMemberships = memberships.filter((membership) =>
    ['ACTIVE', 'TRIALING', 'PAUSED', 'PAST_DUE'].includes(membership.status) &&
    (membership.product.kind !== 'INTRO_TRIAL' ||
      !introTrialIsExpired({
        activatedAt: membership.activatedAt,
        currentPeriodEnd: membership.currentPeriodEnd,
        firstClassAt: firstTrialClassAt,
        now,
      })),
  );
  const currentMembership = displayMemberships[0];
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
    ? introTrialDaysRemaining({
        activatedAt: currentMembership.activatedAt,
        currentPeriodEnd: currentMembership.currentPeriodEnd,
        firstClassAt: firstTrialClassAt,
        now,
      })
    : null;
  const trialCreditNote = currentMembership?.product.kind === 'INTRO_TRIAL'
    ? introTrialCreditCountdownMessage(trialDays)
    : latestExpiredIntroTrial && !currentMembership
      ? 'Trial expired'
      : null;
  const giftedVipNote = giftedVipAccessNote(currentMembership?.product.slug);
  const replacementProducts = products.filter(
    (product) => product.billingInterval !== 'ONE_TIME' && product.id !== currentMembership?.productId,
  );
  const selectedPlan = searchParams.privatePlan || searchParams.plan;
  const orderedProducts = [...products].sort((a, b) => {
    if (a.slug === selectedPlan) return -1;
    if (b.slug === selectedPlan) return 1;
    return a.displayOrder - b.displayOrder || a.priceCents - b.priceCents;
  });
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Access & credits</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">MY MEMBERSHIP</h1>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="border-t-4 border-rhyze-gold bg-white p-6"><p className="text-xs font-black uppercase tracking-widest">Available class credits</p><p className={`mt-2 font-display ${creditBalances.hasUnlimitedClassAccess ? 'text-3xl leading-tight' : 'text-6xl'}`}>{classCreditLabel}</p>{trialCreditNote && <p className="mt-3 text-sm font-black text-rhyze-coral">{trialCreditNote}</p>}</div>
        <div className="border-t-4 border-rhyze-orange bg-white p-6"><p className="text-xs font-black uppercase tracking-widest">Available event credits</p><p className="mt-2 font-display text-6xl">{creditBalances.eventCredits}</p></div>
        <div className="border-t-4 border-rhyze-coral bg-white p-6"><p className="text-xs font-black uppercase tracking-widest">Active plans</p><p className="mt-2 font-display text-6xl">{displayMemberships.filter((item) => ['ACTIVE','TRIALING'].includes(item.status)).length}</p></div>
      </div>
      {searchParams.result && <p className="mt-6 border-l-4 border-rhyze-coral bg-white p-4 font-bold">{resultMessages[searchParams.result] || 'Membership updated.'}</p>}
      <section className="mt-8 border-t-4 border-rhyze-coral bg-white p-6">
        <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">Current membership</p>
        {currentMembership ? (
          <>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-5xl tracking-wider">{currentMembership.product.name}</h2>
                <p className="mt-2 text-sm font-bold text-rhyze-black/55">
                  {currentMembership.status.replaceAll('_', ' ')} · {date(currentMembership.currentPeriodStart)} – {date(currentMembership.currentPeriodEnd)}
                </p>
                {giftedVipNote && <p className="mt-2 text-sm font-black text-rhyze-coral">{giftedVipNote}</p>}
              </div>
              {trialDays !== null && (
                <div className="bg-orange-50 px-5 py-3 text-right">
                  <strong className="font-display text-4xl">{trialDays}</strong>
                  <span className="ml-2 text-xs font-black uppercase tracking-widest">days left</span>
                </div>
              )}
              {currentMembership.product.kind === 'INTRO_TRIAL' && trialDays === null && (
                <p className="max-w-sm bg-orange-50 p-4 text-sm font-bold">Your seven days begin when you book your first eligible class.</p>
              )}
            </div>
            {currentMembership.freezes.length > 0 && (
              <div className="mt-5 border-l-4 border-rhyze-orange bg-orange-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest">Membership freeze schedule</p>
                {currentMembership.freezes.map((freeze) => (
                  <p key={freeze.id} className="mt-2 text-sm font-bold">{date(freeze.startAt)} → resume {date(freeze.endAt)} · {freeze.resumedAt ? 'Completed' : freeze.activatedAt ? 'Active' : 'Scheduled'}</p>
                ))}
              </div>
            )}
            {currentMembership.changeRequests[0] ? (
              <div className="mt-6 border-l-4 border-rhyze-gold bg-orange-50 p-4">
                <strong className="block text-xs uppercase tracking-widest">Management review pending</strong>
                <p className="mt-1 text-sm">
                  {currentMembership.changeRequests[0].type === 'CHANGE'
                    ? `Requested change to ${currentMembership.changeRequests[0].requestedProduct?.name || 'another plan'}.`
                    : 'Cancellation requested for the end of the paid billing period.'}
                  {' '}Your current access remains unchanged until management reviews it.
                </p>
              </div>
            ) : (
              <MembershipChangeRequestForm
                membershipId={currentMembership.id}
                replacementPlans={replacementProducts.map(({ id, name }) => ({ id, name }))}
                nextBillingDate={date(currentMembership.currentPeriodEnd)}
              />
            )}
          </>
        ) : (
          <p className="mt-3 text-sm font-bold text-rhyze-black/55">You do not currently have an active Rhyze membership.</p>
        )}
      </section>
      <h2 id="available-plans" className="mt-10 scroll-mt-52 font-display text-4xl tracking-wider">AVAILABLE PLANS</h2>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {orderedProducts.map((product) => {
          const privateAccess = canAccessPrivateMembership(product.slug, searchParams.privatePlan);
          const available = product.isPublic
            ? isProductAvailable(product, now)
            : privateAccess && isProductActiveInWindow(product, now);
          const availabilityMessage = productAvailabilityMessage(product, now);
          const cadence = productCheckoutCadence(product);
          return (
          <article key={product.id} className={product.slug === selectedPlan ? 'border-2 border-rhyze-orange bg-orange-50 p-6 shadow-lg' : 'bg-white p-6'}>
            <h3 className="font-display text-3xl tracking-wider">{product.name}</h3>
            <p className="mt-2 text-sm text-rhyze-black/55">{removeExpiredRhyze2026PromoCopy(product.description, now)}</p>
            <div className="mt-5 flex items-center justify-between gap-4">
              <strong>${(product.priceCents/100).toFixed(2)} <span className="text-xs font-bold text-rhyze-black/50">{cadence.label}</span></strong>
              {available ? (
                <form action={startCheckoutAction} className="grid min-w-56 gap-2">
                  <input type="hidden" name="productId" value={product.id}/>
                  {privateAccess && <input type="hidden" name="privatePlan" value={product.slug} />}
                  {isReferralEligibleProduct(product.kind) && (
                    <label className="grid gap-1 text-[10px] font-black uppercase tracking-widest text-rhyze-black/55">
                      Instructor referral code or promo code <span className="normal-case tracking-normal">{membershipPromoCodeInputHelp(now)} Single-class referrals include a $5 instructor commission.</span>
                      <input
                        name="referralCode"
                        autoComplete="off"
                        className="min-h-11 border border-rhyze-orange/35 bg-orange-50 px-3 text-sm font-normal uppercase tracking-normal text-rhyze-black"
                      />
                    </label>
                  )}
                  {product.kind === 'INTRO_TRIAL' && <TrialPolicyConsent />}
                  <button className="bg-rhyze-gradient px-4 py-3 text-xs font-black uppercase tracking-widest">Buy securely</button>
                </form>
              ) : (
                <button type="button" disabled className="border border-rhyze-orange/40 bg-rhyze-orange/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-rhyze-coral">
                  {availabilityMessage || 'Currently unavailable'}
                </button>
              )}
            </div>
          </article>
        )})}
      </div>
    </>
  );
}
