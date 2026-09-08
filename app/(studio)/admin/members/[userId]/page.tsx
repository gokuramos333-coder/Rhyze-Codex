import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import {
  CalendarCheck,
  FileSignature,
  Mail,
  Phone,
  UserRound,
} from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { adminClientStatus } from '@/lib/admin/client-status';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import { memberSpendTotals } from '@/lib/admin/member-spend';
import { cancellationNoticeStatus } from '@/lib/domain/memberships/change-request';
import { importedBookingParty } from '@/lib/domain/bookings/imported-booking-party';
import { importedReservationPayment } from '@/lib/admin/imported-reservation-payment';
import { AdminMemberMessagePanel } from '@/components/messages/AdminMemberMessagePanel';
import { DeleteManualCreditForm } from '@/components/admin/DeleteManualCreditForm';
import { clientDirectoryBookedClassCount } from '@/lib/admin/activity-client-metrics';
import { isVisiblePaymentHistoryPurchase } from '@/lib/payments/payment-history-visibility';
import {
  availableCreditSummary,
  classCreditDisplayLabel,
} from '@/lib/domain/credits/credit-balances';
import { introTrialIsExpired } from '@/lib/domain/memberships/membership-display';
import { giftedVipAccessNote } from '@/lib/domain/memberships/gifted-vip';
import {
  manualCreditAccountCanBeDeleted,
  manualCreditKindForLabel,
} from '@/lib/domain/credits/manual-credit';
import {
  deleteManualMemberCreditsAction,
  grantManualMemberCreditsAction,
  refundMemberPurchaseAction,
  returnTransactionCreditAction,
  reviewMembershipChangeRequestAction,
  scheduleMembershipFreezeAction,
  sendMemberMessageAction,
  updateManualMemberCreditsAction,
  updateAdminMemberProfilePhotoAction,
  updateMemberMembershipAction,
} from './actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function money(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function date(value: Date | null | undefined) {
  return value
    ? value.toLocaleDateString('en-US', {
        dateStyle: 'medium',
        timeZone: 'America/New_York',
      })
    : '—';
}

function dateInputValue(value: Date | null | undefined) {
  return value
    ? new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(value)
    : '';
}

function manualCreditReason(entries: { reason: string | null }[]) {
  const newestFirst = [...entries].reverse();
  const reason = newestFirst
    .find((entry) => entry.reason?.startsWith('Manual admin credit update:'))
    ?.reason?.replace('Manual admin credit update: ', '') ||
    newestFirst
      .find((entry) => entry.reason?.startsWith('Manual admin credit grant:'))
      ?.reason?.replace('Manual admin credit grant: ', '');
  return reason || 'Payment confirmed by admin';
}

function dateTime(value: Date | null | undefined) {
  return value
    ? value.toLocaleString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';
}

export default async function AdminMemberDetailPage(
  props: {
    params: Promise<{ userId: string }>;
    searchParams: Promise<{ sent?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const [member, activeWaiver] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.userId },
      include: {
        memberProfile: true,
        notificationPreference: true,
        sombleClientProfile: true,
        sombleTransactions: { orderBy: { transferredAt: 'desc' } },
        memberConversation: {
          include: {
            messages: {
              include: { sender: { select: { name: true, email: true } } },
              orderBy: { createdAt: 'asc' },
              take: 100,
            },
          },
        },
        referralAttribution: {
          include: {
            referralCode: {
              include: { instructor: { select: { name: true, email: true } } },
            },
          },
        },
        referralCommission: {
          include: {
            instructor: { select: { name: true, email: true } },
            purchase: { include: { product: true } },
          },
        },
        waiverAcceptances: {
          include: { waiverVersion: true },
          orderBy: { acceptedAt: 'desc' },
        },
        memberships: {
          include: {
            product: true,
            freezes: { where: { cancelledAt: null }, orderBy: { startAt: 'desc' } },
            changeRequests: {
              where: { status: 'PENDING' },
              include: { requestedProduct: true },
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        purchases: {
          include: {
            product: true,
            invoice: true,
            refunds: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        paymentRecords: {
          include: {
            purchase: { include: { product: true } },
            membership: { include: { product: true } },
            commerceOrder: {
              include: {
                items: true,
                occurrence: { include: { template: true } },
              },
            },
          },
          orderBy: { occurredAt: 'desc' },
        },
        bookings: {
          include: {
            occurrence: {
              include: {
                template: true,
                instructor: { select: { name: true } },
              },
            },
            attendance: true,
          },
          orderBy: { bookedAt: 'desc' },
          take: 100,
        },
        creditAccounts: {
          include: {
            entries: true,
            sourcePurchase: {
              include: {
                membership: { select: { status: true, activatedAt: true, currentPeriodEnd: true } },
                product: { select: { kind: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    }),
    prisma.waiverVersion.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
    }),
  ]);
  if (!member) notFound();
  const referralCommission = member.referralCommission;
  const now = new Date();

  const currentWaiver = activeWaiver
    ? member.waiverAcceptances.find(
        (acceptance) => acceptance.waiverVersionId === activeWaiver.id,
      )
    : null;
  const activeMemberships = member.memberships.filter((membership) =>
    ['ACTIVE', 'TRIALING', 'PAUSED', 'PAST_DUE'].includes(membership.status) &&
    (membership.product.kind !== 'INTRO_TRIAL' ||
      !introTrialIsExpired({
        activatedAt: membership.activatedAt,
        currentPeriodEnd: membership.currentPeriodEnd,
        now,
      })),
  );
  const currentMembership = activeMemberships[0];
  const creditBalances = availableCreditSummary(member.creditAccounts
    .filter((account) => {
      const membership = account.sourcePurchase?.membership;
      if (
        account.sourcePurchase?.product.kind === 'INTRO_TRIAL' &&
        introTrialIsExpired({
          activatedAt: membership?.activatedAt ?? null,
          currentPeriodEnd: membership?.currentPeriodEnd ?? null,
          now,
        })
      ) {
        return false;
      }
      return account.validFrom <= now && (!account.validUntil || account.validUntil > now);
    })
    .map((account) => ({
      label: account.label,
      isUnlimited: account.isUnlimited,
      available: account.isUnlimited
        ? 0
        : account.entries.reduce((sum, entry) => sum + entry.quantity, 0),
    })));
  const classCreditLabel = classCreditDisplayLabel(
    creditBalances,
    currentMembership?.product.kind,
  );
  const activeCredits = member.creditAccounts
    .map((account) => ({
      ...account,
      balance: account.entries.reduce((sum, entry) => sum + entry.quantity, 0),
      restored: account.entries.some(
        (entry) =>
          entry.type === 'RESTORE' ||
          entry.reason?.includes('Manual attendance credit restore') ||
          entry.sourceReturnKey?.startsWith('attendance-restore:'),
      ),
      manualGrant: account.entries.some(
        (entry) =>
          entry.type === 'GRANT' && entry.reason?.startsWith('Manual admin credit grant:'),
      ),
      deletable: manualCreditAccountCanBeDeleted(account),
    }))
    .filter(
      (account) =>
        account.balance > 0 &&
        account.validFrom <= now &&
        (!account.validUntil || account.validUntil > now),
    );
  const bookedClassCount = clientDirectoryBookedClassCount(member);
  const status =
    adminClientStatus({
      email: member.email,
      role: member.role,
      accountStatus: member.status,
      sombleStatus: member.sombleClientProfile?.sourceStatus,
      bookingCount: bookedClassCount,
      hasActiveMembership: activeMemberships.some((item) => ['ACTIVE', 'TRIALING'].includes(item.status)),
      hasClaimedAccount: Boolean(member.passwordHash),
      isSombleTransferred: Boolean(member.sombleClientProfile),
    });
  const recordedPurchaseIds = new Set(
    member.paymentRecords.flatMap((payment) =>
      payment.purchaseId ? [payment.purchaseId] : [],
    ),
  );
  const unrecordedPurchases = member.purchases.filter(
    (purchase) =>
      !recordedPurchaseIds.has(purchase.id) &&
      isVisiblePaymentHistoryPurchase(purchase),
  );
  const spend = memberSpendTotals({
    nativePayments: [
      ...member.paymentRecords,
      ...unrecordedPurchases.map((purchase) => ({
        amountCents: purchase.amountCents,
        refundedAmountCents: purchase.refundedAmountCents,
        status: purchase.status === 'PAID' ? 'SUCCEEDED' : purchase.status,
        occurredAt: purchase.paidAt || purchase.createdAt,
      })),
    ],
    sombleTransactions: member.sombleTransactions,
  });
  const importedClassReservations = member.bookings
    .filter((booking) => booking.source === 'SOMBLE_IMPORT')
    .map((booking) => ({
      booking,
      party: importedBookingParty(booking.policySnapshot),
    }));

  return (
    <>
      <Link
        href="/admin/members"
        className="text-xs font-black uppercase tracking-widest text-rhyze-coral"
      >
        ← Client directory
      </Link>
      <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
            Complete client record
          </p>
          <h1 className="mt-3 font-display text-6xl tracking-wider md:text-8xl">
            {member.name || 'PROFILE INCOMPLETE'}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <AdminStatusBadge status={status} />
            <span className="text-sm font-bold text-rhyze-black/50">
              Joined {date(member.sombleClientProfile?.sourceJoinedAt || member.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`mailto:${member.email}`}
            className="inline-flex items-center gap-2 bg-rhyze-black px-4 py-3 text-xs font-black uppercase text-white"
          >
            <Mail className="h-4 w-4" /> Email client
          </a>
          {member.memberProfile?.phone && (
            <a
              href={`tel:${member.memberProfile.phone.replace(/[^\d+]/g, '')}`}
              className="inline-flex items-center gap-2 border border-rhyze-black px-4 py-3 text-xs font-black uppercase"
            >
              <Phone className="h-4 w-4" /> Call client
            </a>
          )}
        </div>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Classes booked" value={`${bookedClassCount}`} icon={<CalendarCheck />} href="#class-history" actionLabel="View class history →" />
        <Metric label="Available class credits" value={classCreditLabel} icon={<UserRound />} href="#credits" />
        <Metric label="Available event credits" value={`${creditBalances.eventCredits}`} icon={<UserRound />} href="#credits" />
        <Metric label="Payments recorded" value={`${member.paymentRecords.length + unrecordedPurchases.length + member.sombleTransactions.length}`} icon={<CalendarCheck />} href="#payment-history" />
        <Metric label="Active plans" value={`${activeMemberships.filter((item) => ['ACTIVE', 'TRIALING'].includes(item.status)).length}`} icon={<UserRound />} />
        <Metric label="Spent this year" value={money(spend.yearlyCents)} icon={<CalendarCheck />} href="#payment-history" />
        <Metric label="Lifetime spent" value={money(spend.lifetimeCents)} icon={<CalendarCheck />} href="#payment-history" />
      </div>
      {searchParams.sent === 'message' && (
        <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">
          Message sent. It will appear as a new alert when this member enters My Rhyze.
        </p>
      )}
      {searchParams.sent === 'membership-action' && (
        <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">Membership updated in Stripe and Rhyze.</p>
      )}
      {searchParams.sent === 'freeze' && (
        <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">Membership freeze scheduled. The member was notified.</p>
      )}
      {searchParams.sent === 'request-review' && (
        <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">Membership request reviewed and the member was notified.</p>
      )}
      {searchParams.sent === 'credit-returned' && (
        <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">One class credit was returned and will expire in 14 days.</p>
      )}
      {searchParams.sent === 'attendance-credit-restored' && (
        <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">Attendance credit restored. Credit must be applied within 2 weeks.</p>
      )}
      {searchParams.sent === 'manual-credit' && (
        <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">Manual credit grant saved. The member can use those credits until the custom expiration date.</p>
      )}
      {searchParams.sent === 'manual-credit-updated' && (
        <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">Manual credit grant updated. The member’s credit balance and expiration date now reflect your changes.</p>
      )}
      {searchParams.sent === 'manual-credit-deleted' && (
        <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">Unused manual credit grant deleted. Existing payments and booking history were not changed.</p>
      )}
      {searchParams.sent === 'photo' && (
        <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">Profile photo updated. The member’s default account photo now uses the new upload.</p>
      )}
      {searchParams.sent === 'credit-already-returned' && (
        <p className="mt-6 border-l-4 border-rhyze-gold bg-orange-50 p-4 font-bold">A returned credit already exists for that transaction.</p>
      )}
      {searchParams.sent === 'refund' && (
        <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">The Stripe refund was issued and related access was closed.</p>
      )}
      {(searchParams.error === 'refund' || searchParams.error === 'credit-return') && (
        <p className="mt-6 border-l-4 border-red-700 bg-red-100 p-4 font-bold text-red-900">That transaction action could not be completed. No additional credit or refund was recorded.</p>
      )}
      {searchParams.error === 'manual-credit' && (
        <p className="mt-6 border-l-4 border-red-700 bg-red-100 p-4 font-bold text-red-900">The manual credit grant was not saved. Confirm the quantity, reason, and future expiration date.</p>
      )}
      {searchParams.error === 'manual-credit-delete' && (
        <p className="mt-6 border-l-4 border-red-700 bg-red-100 p-4 font-bold text-red-900">That credit could not be deleted. Only unused manual admin grants can be removed.</p>
      )}
      {searchParams.error === 'membership-action' && (
        <p className="mt-6 border-l-4 border-red-700 bg-red-100 p-4 font-bold text-red-900">The membership was not changed. Check its current status and Stripe connection, then try again.</p>
      )}
      {searchParams.error === 'freeze-policy' && (
        <p className="mt-6 border-l-4 border-red-700 bg-red-100 p-4 font-bold text-red-900">That freeze overlaps another freeze or exceeds the 92-day yearly maximum.</p>
      )}
      {searchParams.error === 'freeze' && (
        <p className="mt-6 border-l-4 border-red-700 bg-red-100 p-4 font-bold text-red-900">The freeze could not be scheduled. No membership or billing change was saved.</p>
      )}
      {searchParams.error === 'request-review' && (
        <p className="mt-6 border-l-4 border-red-700 bg-red-100 p-4 font-bold text-red-900">The request could not be completed. No billing or access change was saved.</p>
      )}
      {searchParams.error === 'change-policy' && (
        <p className="mt-6 border-l-4 border-rhyze-gold bg-orange-50 p-4 font-bold">Vanessa’s plan-change terms are not finalized. Contact the member and deny or leave this request pending; automatic plan switching is locked.</p>
      )}
      {searchParams.error === 'message' && (
        <p className="mt-6 border-l-4 border-rhyze-coral bg-orange-50 p-4 font-bold text-rhyze-coral">
          Add a subject and message before sending.
        </p>
      )}
      {searchParams.error === 'photo' && (
        <p className="mt-6 border-l-4 border-red-700 bg-red-100 p-4 font-bold text-red-900">The profile photo was not saved. Use a valid JPG, PNG, HEIC, HEIF, or WebP image up to 8 MB.</p>
      )}
      <AdminMemberMessagePanel
        action={sendMemberMessageAction}
        userId={member.id}
        memberName={member.name || member.email}
        messages={(member.memberConversation?.messages || []).map((message) => ({
          id: message.id,
          sender: message.sender.name || message.sender.email,
          body: message.body,
          createdAt: message.createdAt.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }),
          deleted: Boolean(message.deletedAt),
        }))}
      />
      <section id="credits" className="mt-8 scroll-mt-24 border-t-4 border-rhyze-gold bg-white p-5">
        <h2 className="font-display text-4xl tracking-wider">CREDITS</h2>
        <p className="mt-1 text-sm font-bold text-rhyze-black/55">Admins can manually grant paid credits with a custom expiration date. Attendance restores still default to the two-week rollover policy.</p>
        <form action={grantManualMemberCreditsAction} className="mt-4 grid gap-3 border border-rhyze-orange/30 bg-orange-50 p-4 md:grid-cols-[10rem_8rem_12rem_1fr_auto] md:items-end">
          <input type="hidden" name="userId" value={member.id} />
          <label className="grid gap-1 text-[10px] font-black uppercase">
            Credit type
            <select name="creditKind" required defaultValue="CLASS" className="min-h-10 border bg-white px-2 text-sm font-normal">
              <option value="CLASS">Class credit</option>
              <option value="EVENT">Event credit</option>
            </select>
          </label>
          <label className="grid gap-1 text-[10px] font-black uppercase">
            Credits
            <input type="number" name="quantity" min="1" max="100" required className="min-h-10 border bg-white px-2 text-sm font-normal" />
          </label>
          <label className="grid gap-1 text-[10px] font-black uppercase">
            Expires after
            <input type="date" name="expirationDate" required className="min-h-10 border bg-white px-2 text-sm font-normal" />
          </label>
          <label className="grid gap-1 text-[10px] font-black uppercase">
            Reason / payment note
            <input name="reason" maxLength={240} required placeholder="Payment confirmed by admin" className="min-h-10 border bg-white px-3 text-sm font-normal" />
          </label>
          <button className="min-h-10 bg-rhyze-black px-4 text-[10px] font-black uppercase text-white">Grant credits</button>
          <p className="text-xs font-bold text-rhyze-black/50 md:col-span-5">Manual grants create a separate class-only or event-only credit account, ledger entry, and audit log under the signed-in admin.</p>
        </form>
        <div className="mt-4 grid gap-2">
          {activeCredits.map((credit) => (
            credit.manualGrant ? (
              <details key={credit.id} className="group border-l-4 border-rhyze-orange bg-orange-50 p-4">
                <summary className="cursor-pointer list-none">
                  <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">{credit.label}</p>
                  <p className="mt-1 text-sm font-bold">{credit.balance} credit available · apply by {date(credit.validUntil)}</p>
                  <p className="mt-1 text-xs font-bold text-rhyze-black/50">Manual admin grant · click to edit amount or expiration; unused grants can also be deleted</p>
                </summary>
                <form action={updateManualMemberCreditsAction} className="mt-4 grid gap-3 border border-rhyze-orange/30 bg-white p-4 md:grid-cols-[10rem_8rem_12rem_1fr_auto] md:items-end">
                  <input type="hidden" name="userId" value={member.id} />
                  <input type="hidden" name="creditAccountId" value={credit.id} />
                  <label className="grid gap-1 text-[10px] font-black uppercase">
                    Credit type
                    <select name="creditKind" required defaultValue={manualCreditKindForLabel(credit.label)} className="min-h-10 border bg-white px-2 text-sm font-normal">
                      <option value="CLASS">Class credit</option>
                      <option value="EVENT">Event credit</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-[10px] font-black uppercase">
                    Credits
                    <input type="number" name="quantity" min="1" max="100" required defaultValue={credit.balance} className="min-h-10 border bg-white px-2 text-sm font-normal" />
                  </label>
                  <label className="grid gap-1 text-[10px] font-black uppercase">
                    Expires after
                    <input type="date" name="expirationDate" required defaultValue={dateInputValue(credit.validUntil)} className="min-h-10 border bg-white px-2 text-sm font-normal" />
                  </label>
                  <label className="grid gap-1 text-[10px] font-black uppercase">
                    Reason for change
                    <input name="reason" maxLength={240} required defaultValue={manualCreditReason(credit.entries)} className="min-h-10 border bg-white px-3 text-sm font-normal" />
                  </label>
                  <button className="min-h-10 bg-rhyze-black px-4 text-[10px] font-black uppercase text-white">Update credit</button>
                  <p className="text-xs font-bold text-rhyze-black/50 md:col-span-5">Changing the amount or credit type remains traceable in the original grant’s audit history.</p>
                </form>
                {credit.deletable && (
                  <DeleteManualCreditForm
                    action={deleteManualMemberCreditsAction}
                    userId={member.id}
                    creditAccountId={credit.id}
                    label={credit.label}
                  />
                )}
              </details>
            ) : (
              <div key={credit.id} className="border-l-4 border-rhyze-orange bg-orange-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">{credit.label}</p>
                <p className="mt-1 text-sm font-bold">{credit.balance} credit available · apply by {date(credit.validUntil)}</p>
                {credit.restored && <p className="mt-1 text-xs font-bold text-rhyze-black/50">Restored rollover credit</p>}
              </div>
            )
          ))}
          {activeCredits.length === 0 && <p className="text-sm font-bold text-rhyze-black/45">No active credits are currently available.</p>}
        </div>
      </section>
      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[1fr_1.35fr]">
        <div className="grid gap-6">
          <InfoSection title="PROFILE PHOTO">
            <div id="profile-photo" className="flex flex-wrap items-center gap-4 scroll-mt-24">
              <div className="relative grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-rhyze-black text-3xl font-black text-white">
                {member.memberProfile?.photoUrl || member.image ? (
                  <Image
                    src={member.memberProfile?.photoUrl || member.image || ''}
                    alt={`${member.name || member.email} profile photo`}
                    fill
                    sizes="6rem"
                    className="object-cover"
                    unoptimized={(member.memberProfile?.photoUrl || member.image || '').startsWith('/api/media/')}
                  />
                ) : (
                  (member.name || member.email || 'R').charAt(0)
                )}
              </div>
              <form action={updateAdminMemberProfilePhotoAction} className="grid flex-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <input type="hidden" name="userId" value={member.id} />
                <label className="grid gap-1 text-[10px] font-black uppercase">
                  Upload photo
                  <input type="file" name="photo" accept=".heic,.heif,.jpeg,.jpg,.png,.webp,image/heic,image/heif,image/jpeg,image/png,image/webp" required className="min-h-10 border bg-orange-50 p-2 text-sm font-normal" />
                </label>
                <button className="min-h-10 bg-rhyze-black px-4 text-[10px] font-black uppercase text-white">Save photo</button>
                <p className="text-xs font-bold text-rhyze-black/50 sm:col-span-2">Updates both the member profile photo and the default account photo used across Rhyze.</p>
              </form>
            </div>
          </InfoSection>
          <InfoSection title="CONTACT + PROFILE">
            <Info label="Email" value={member.email} />
            <Info label="Phone" value={member.memberProfile?.phone || 'Not provided'} />
            <Info
              label="Emergency contact"
              value={
                [member.memberProfile?.emergencyContactName, member.memberProfile?.emergencyContactPhone]
                  .filter(Boolean)
                  .join(' · ') || 'Not provided'
              }
            />
            <Info
              label="Address"
              value={
                [
                  member.memberProfile?.addressLine1,
                  member.memberProfile?.city,
                  member.memberProfile?.region,
                  member.memberProfile?.postalCode,
                ]
                  .filter(Boolean)
                  .join(', ') || 'Not provided'
              }
            />
            <Info label="Last login" value={date(member.lastLoginAt || member.sombleClientProfile?.lastLoginAt)} />
            <Info
              label="Instructor referral used"
              value={
                referralCommission
                  ? `${referralCommission.instructor.name || referralCommission.instructor.email} · ${referralCommission.purchase.product.name} · ${money(referralCommission.amountCents)} commission`
                  : member.referralAttribution
                    ? `${member.referralAttribution.referralCode.instructor.name || member.referralAttribution.referralCode.instructor.email} · code ${member.referralAttribution.referralCode.code} · awaiting qualifying paid purchase`
                    : 'None'
              }
            />
          </InfoSection>

          <InfoSection title="WAIVER + PREFERENCES">
            <div className="flex items-center justify-between gap-4 border-b border-black/10 py-3">
              <span className="flex items-center gap-2 text-sm font-bold">
                <FileSignature className="h-4 w-4 text-rhyze-coral" />
                Current policy waiver
              </span>
              <AdminStatusBadge status={currentWaiver ? 'Complete' : 'Missing'} />
            </div>
            <Info
              label="Signed"
              value={
                currentWaiver
                  ? `${date(currentWaiver.signedDate)} · version ${currentWaiver.waiverVersion.version}`
                  : 'Requires signature before booking'
              }
            />
            <Info
              label="Class reminders"
              value={member.notificationPreference?.classReminders === false ? 'Off' : 'On'}
            />
            <Info
              label="Studio news + offers"
              value={member.notificationPreference?.marketingEmail === false ? 'Opted out' : 'Subscribed'}
            />
          </InfoSection>

          <InfoSection title="MEMBERSHIPS">
            {member.memberships.map((membership) => (
              <div key={membership.id} className="border-b border-black/10 py-3">
                <div className="flex items-center justify-between gap-3">
                  <strong>{membership.product.name}</strong>
                  <AdminStatusBadge status={membership.status} />
                </div>
                <p className="mt-1 text-xs font-bold text-rhyze-black/45">
                  {date(membership.currentPeriodStart)} – {date(membership.currentPeriodEnd)}
                </p>
                {giftedVipAccessNote(membership.product.slug) && (
                  <p className="mt-2 bg-orange-50 p-2 text-xs font-black text-rhyze-coral">
                    {giftedVipAccessNote(membership.product.slug)}
                  </p>
                )}
                {membership.cancelAtPeriodEnd && <p className="mt-2 bg-red-100 p-2 text-xs font-black uppercase text-red-900">Cancels at period end</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(membership.status === 'ACTIVE' || membership.status === 'TRIALING') && (
                    <form action={updateMemberMembershipAction}>
                      <input type="hidden" name="userId" value={member.id} />
                      <input type="hidden" name="membershipId" value={membership.id} />
                      <input type="hidden" name="membershipAction" value="PAUSE" />
                      <button className="border border-amber-700 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase text-amber-900">Pause</button>
                    </form>
                  )}
                  {membership.status === 'PAUSED' && (
                    <form action={updateMemberMembershipAction}>
                      <input type="hidden" name="userId" value={member.id} />
                      <input type="hidden" name="membershipId" value={membership.id} />
                      <input type="hidden" name="membershipAction" value="UNPAUSE" />
                      <button className="border border-emerald-700 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase text-emerald-900">Unpause</button>
                    </form>
                  )}
                </div>
                <form action={scheduleMembershipFreezeAction} className="mt-4 grid gap-3 border border-rhyze-orange/30 bg-orange-50 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <input type="hidden" name="userId" value={member.id} />
                  <input type="hidden" name="membershipId" value={membership.id} />
                  <label className="grid gap-1 text-[10px] font-black uppercase">Freeze from<input type="date" name="startDate" required className="min-h-10 border bg-white px-2 text-sm font-normal" /></label>
                  <label className="grid gap-1 text-[10px] font-black uppercase">Resume on<input type="date" name="resumeDate" required className="min-h-10 border bg-white px-2 text-sm font-normal" /></label>
                  <button className="min-h-10 bg-rhyze-black px-4 text-[10px] font-black uppercase text-white">Schedule freeze</button>
                  <p className="text-xs font-bold text-rhyze-black/50 sm:col-span-3">Maximum 92 combined freeze days per calendar year.</p>
                </form>
                {membership.freezes.length > 0 && (
                  <div className="mt-3 grid gap-2">
                    {membership.freezes.map((freeze) => (
                      <p key={freeze.id} className="bg-white p-2 text-xs font-bold">Freeze: {date(freeze.startAt)} → resume {date(freeze.endAt)} · {freeze.resumedAt ? 'Completed' : freeze.activatedAt ? 'Active' : 'Scheduled'}</p>
                    ))}
                  </div>
                )}
                {membership.changeRequests.map((request) => {
                  const notice = cancellationNoticeStatus(
                    membership.currentPeriodEnd,
                    request.createdAt,
                  );
                  return (
                  <form key={request.id} action={reviewMembershipChangeRequestAction} className="mt-4 grid gap-3 border border-rhyze-orange/30 bg-orange-50 p-4">
                    <input type="hidden" name="userId" value={member.id} />
                    <input type="hidden" name="requestId" value={request.id} />
                    <p className="text-xs font-black uppercase tracking-widest">Pending {request.type.toLowerCase()} request</p>
                    <p className="text-sm">
                      {request.type === 'CHANGE' ? `Requested plan: ${request.requestedProduct?.name || 'Not selected'}. ` : 'Requested cancellation at the end of the paid billing period. '}
                      {request.memberNote || 'No member note.'}
                    </p>
                    {request.type === 'CANCEL' && (
                      <p className={`p-2 text-xs font-black ${notice.meetsNotice ? 'bg-emerald-50 text-emerald-900' : 'bg-red-100 text-red-900'}`}>
                        {notice.meetsNotice
                          ? `Notice requirement met · ${notice.daysBeforeRenewal} days before billing.`
                          : `Inside the 14-day notice window · ${notice.daysBeforeRenewal ?? 'unknown'} days before billing. Review for the following billing cycle.`}
                      </p>
                    )}
                    <input name="reviewNote" maxLength={1000} placeholder="Optional response to member" className="min-h-11 border border-rhyze-orange/30 bg-white px-3 text-sm" />
                    <div className="flex flex-wrap gap-2">
                      {request.type === 'CANCEL' && <button name="decision" value="APPROVE" className="bg-rhyze-black px-3 py-2 text-[10px] font-black uppercase text-white">Approve period-end cancellation</button>}
                      <button name="decision" value="DENY" className="border border-red-700 bg-red-100 px-3 py-2 text-[10px] font-black uppercase text-red-900">Deny request</button>
                    </div>
                    {request.type === 'CHANGE' && <p className="text-xs font-bold text-rhyze-black/50">Automatic plan switching remains locked until management confirms the plan-change terms.</p>}
                  </form>
                  );
                })}
              </div>
            ))}
            {!member.memberships.length && (
              <p className="py-4 text-sm font-bold text-rhyze-black/45">
                No native Rhyze membership yet.
              </p>
            )}
          </InfoSection>
        </div>

        <div className="grid gap-6">
          <section id="class-history" className="scroll-mt-24 border-t-4 border-rhyze-orange bg-white p-5">
            <h2 className="font-display text-4xl tracking-wider">CLASS HISTORY</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-xs uppercase text-rhyze-black/45">
                    <th className="py-3">Class</th>
                    <th>Date</th>
                    <th>Booked at</th>
                    <th>Instructor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {member.bookings.map((booking) => {
                    const party = importedBookingParty(booking.policySnapshot);
                    return (
                    <tr key={booking.id} className="border-b border-black/5">
                      <td className="py-3">
                        <Link
                          href={`/admin/schedule/${booking.occurrenceId}/roster`}
                          className="font-bold hover:text-rhyze-coral"
                        >
                          {booking.occurrence.template.name}
                        </Link>
                        {party.seatCount > 1 && (
                          <small className="mt-1 block font-bold text-rhyze-coral">
                            {party.seatCount} spots · {party.guestNames.length} guests
                          </small>
                        )}
                      </td>
                      <td>{date(booking.occurrence.startAt)}</td>
                      <td>{dateTime(booking.bookedAt)}</td>
                      <td>{booking.occurrence.instructor?.name || 'TBA'}</td>
                      <td>
                        <AdminStatusBadge
                          status={booking.attendance?.status || booking.status}
                        />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {!member.bookings.length && (
                <p className="py-8 text-sm font-bold text-rhyze-black/45">
                  No native class bookings are recorded yet.
                </p>
              )}
            </div>
          </section>

          <section id="payment-history" className="scroll-mt-24 border-t-4 border-rhyze-gold bg-white p-5">
            <h2 className="font-display text-4xl tracking-wider">PAYMENT HISTORY</h2>
            <p className="mt-1 text-xs font-bold text-rhyze-black/45">
              Native Rhyze purchases and preserved Somble transfer history.
            </p>
            {importedClassReservations.length > 0 && (
              <div className="mt-4 border-l-4 border-rhyze-orange bg-orange-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-rhyze-coral">
                  Imported class reservations
                </p>
                <div className="mt-2 divide-y divide-rhyze-orange/20">
                  {importedClassReservations.map(({ booking, party }) => {
                    const payment = importedReservationPayment({
                      isEvent: booking.occurrence.template.isEvent,
                      accessType: party.accessType,
                      priceCents: booking.occurrence.priceCents,
                    });
                    return (
                      <div key={booking.id} className="grid gap-2 py-3 md:grid-cols-[1fr_auto]">
                        <span>
                          <Link
                            href={`/admin/schedule/${booking.occurrenceId}/roster`}
                            className="font-black hover:text-rhyze-coral"
                          >
                            {booking.occurrence.template.name}
                          </Link>
                          <small className="mt-1 block text-rhyze-black/55">
                            {date(booking.occurrence.startAt)} · Booked at {dateTime(booking.bookedAt)} · {party.seatCount} booked spots · {party.accessType || 'Somble reservation'}
                          </small>
                          {party.guestNames.length > 0 && (
                            <small className="mt-1 block text-rhyze-black/55">
                              Guests: {party.guestNames.join(' · ')}
                            </small>
                          )}
                        </span>
                        <strong className="text-rhyze-coral">
                          {payment.amountCents == null
                            ? payment.label
                            : `${money(payment.amountCents)} · ${payment.label}`}
                        </strong>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mt-4 divide-y divide-black/10">
              {member.paymentRecords.map((payment) => (
                <details key={payment.id} className="group py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                    <span>
                      <strong className="block">
                        {payment.membership?.product.name ||
                          payment.purchase?.product.name ||
                          payment.commerceOrder?.occurrence?.template.name ||
                          payment.commerceOrder?.items.map((item) => item.name).join(', ') ||
                          payment.kind.replaceAll('_', ' ')}
                      </strong>
                      <small className="text-rhyze-black/45">Native Rhyze · {date(payment.occurredAt)} · {payment.status}</small>
                    </span>
                    <strong className="text-rhyze-coral underline decoration-rhyze-gold underline-offset-4">{money(Math.max(0, payment.amountCents - payment.refundedAmountCents))}</strong>
                  </summary>
                  <div className="mt-3 border-l-4 border-rhyze-orange bg-orange-50 p-4">
                    <p className="text-xs font-black uppercase tracking-widest">Transaction details</p>
                    <p className="mt-2 text-sm">Original amount: {money(payment.amountCents)} · Refunded: {money(payment.refundedAmountCents)}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {payment.purchaseId && ['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status) && payment.stripePaymentIntentId && (
                        <form action={refundMemberPurchaseAction}>
                          <input type="hidden" name="userId" value={member.id} />
                          <input type="hidden" name="purchaseId" value={payment.purchaseId} />
                          <button className="border border-red-700 bg-red-100 px-4 py-2 text-[10px] font-black uppercase text-red-900">Refund payment</button>
                        </form>
                      )}
                      {payment.purchaseId && (
                        <form action={returnTransactionCreditAction}>
                          <input type="hidden" name="userId" value={member.id} />
                          <input type="hidden" name="sourceId" value={payment.purchaseId} />
                          <input type="hidden" name="sourceType" value="RHYZE" />
                          <button className="bg-rhyze-black px-4 py-2 text-[10px] font-black uppercase text-white">Return 1 class credit</button>
                        </form>
                      )}
                    </div>
                    {payment.purchaseId && <p className="mt-2 text-xs font-bold text-rhyze-black/50">Returned credits expire 14 days after return.</p>}
                  </div>
                </details>
              ))}
              {unrecordedPurchases.map((purchase) => (
                <details key={purchase.id} className="group py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                    <span>
                      <strong className="block">{purchase.product.name}</strong>
                      <small className="text-rhyze-black/45">Native Rhyze · {date(purchase.paidAt || purchase.createdAt)} · {purchase.status}</small>
                    </span>
                    <strong className="text-rhyze-coral underline decoration-rhyze-gold underline-offset-4">{money(Math.max(0, purchase.amountCents - purchase.refundedAmountCents))}</strong>
                  </summary>
                  <div className="mt-3 border-l-4 border-rhyze-orange bg-orange-50 p-4">
                    <p className="text-xs font-black uppercase tracking-widest">Transaction details</p>
                    <p className="mt-2 text-sm">Original amount: {money(purchase.amountCents)} · Refunded: {money(purchase.refundedAmountCents)}</p>
                  </div>
                </details>
              ))}
              {member.sombleTransactions.map((transaction) => (
                <details key={transaction.id} className="group py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                    <span>
                      <strong className="block">{transaction.contentType}</strong>
                      <small className="text-rhyze-black/45">Somble transfer · {date(transaction.transferredAt)} · {transaction.paymentId}</small>
                    </span>
                    <strong className="text-rhyze-coral underline decoration-rhyze-gold underline-offset-4">{money(transaction.amountCents)}</strong>
                  </summary>
                  <div className="mt-3 border-l-4 border-rhyze-gold bg-orange-50 p-4">
                    <p className="text-xs font-black uppercase tracking-widest">Transaction details</p>
                    <p className="mt-2 text-sm font-bold">Original payment remains managed in Somble and cannot be refunded from Rhyze.</p>
                    <form action={returnTransactionCreditAction} className="mt-4">
                      <input type="hidden" name="userId" value={member.id} />
                      <input type="hidden" name="sourceId" value={transaction.id} />
                      <input type="hidden" name="sourceType" value="SOMBLE" />
                      <button className="bg-rhyze-black px-4 py-2 text-[10px] font-black uppercase text-white">Return 1 class credit</button>
                    </form>
                    <p className="mt-2 text-xs font-bold text-rhyze-black/50">Expires 14 days after return.</p>
                  </div>
                </details>
              ))}
              {!member.paymentRecords.length && !unrecordedPurchases.length && !member.sombleTransactions.length && (
                <p className="py-6 text-sm font-bold text-rhyze-black/45">
                  No payments recorded.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  icon,
  href,
  actionLabel,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  href?: string;
  actionLabel?: string;
}) {
  const content = (
    <>
      <span className="text-rhyze-coral [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
      <p className="mt-4 text-xs font-black uppercase tracking-widest text-rhyze-black/45">
        {label}
      </p>
      <strong className="mt-2 block font-display text-5xl tracking-wider">{value}</strong>
      {href && <span className="mt-3 block text-[10px] font-black uppercase tracking-widest text-rhyze-coral">{actionLabel || 'View transactions →'}</span>}
    </>
  );
  return href ? (
    <Link href={href} className="border-t-4 border-rhyze-orange bg-white p-5 transition hover:bg-orange-50">
      {content}
    </Link>
  ) : (
    <div className="border-t-4 border-rhyze-orange bg-white p-5">{content}</div>
  );
}

function InfoSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t-4 border-rhyze-gold bg-white p-5">
      <h2 className="font-display text-4xl tracking-wider">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-black/10 py-3 md:grid-cols-[10rem_1fr]">
      <span className="text-xs font-black uppercase tracking-wider text-rhyze-black/40">
        {label}
      </span>
      <strong className="break-words text-sm">{value}</strong>
    </div>
  );
}
