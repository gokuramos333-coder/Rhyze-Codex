import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge';
import { adminRosterHref } from '@/lib/admin/assigned-roster-navigation';
import { prisma } from '@/lib/db/prisma';
import {
  earningsDateRange,
  type EarningsPeriod,
} from '@/lib/domain/referrals/earnings-periods';
import {
  adminUploadCredentialAction,
  reviewCredentialAction,
} from './actions';
import {
  removeInstructorAction,
  updateInstructorDirectoryAction,
  updateInstructorStatusAction,
} from '../actions';

const referralPeriods: EarningsPeriod[] = ['week', 'biweek', 'month', 'custom'];

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

export default async function InstructorReviewPage(
  props: {
    params: Promise<{ userId: string }>;
    searchParams: Promise<{ saved?: string; error?: string; period?: string; from?: string; to?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const period = referralPeriods.includes(searchParams.period as EarningsPeriod)
    ? searchParams.period as EarningsPeriod
    : 'week';
  const range = earningsDateRange(period, new Date(), searchParams.from, searchParams.to);
  const instructor = await prisma.user.findFirst({
      where: { id: params.userId, instructorProfile: { isNot: null } },
      include: {
        instructorProfile: true,
        memberProfile: true,
        instructorApplication: true,
        instructorCredentials: { orderBy: { createdAt: 'desc' } },
        referralCodes: {
          where: { isActive: true },
          take: 1,
          include: {
            attributions: {
              include: { referredUser: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        instructorCommissions: {
          include: {
            referredUser: true,
            purchase: { include: { product: true } },
          },
          orderBy: { earnedAt: 'desc' },
        },
        classOccurrences: {
          include: {
            template: true,
            _count: {
              select: { bookings: { where: { status: 'CONFIRMED' } } },
            },
          },
          orderBy: { startAt: 'asc' },
          take: 250,
        },
      },
    });
  if (!instructor) notFound();

  const filteredCommissions = instructor.instructorCommissions.filter((commission) =>
    (!range.start || commission.earnedAt >= range.start) &&
    (!range.end || commission.earnedAt <= range.end),
  );
  const availableCommissionTotal = filteredCommissions
    .filter((item) => item.status === 'EARNED')
    .reduce((sum, item) => sum + item.amountCents, 0);
  const paidCommissionTotal = filteredCommissions
    .filter((item) => item.status === 'PAID')
    .reduce((sum, item) => sum + item.amountCents, 0);
  const commissionTotal = availableCommissionTotal + paidCommissionTotal;
  const upcoming = instructor.classOccurrences.filter(
    (occurrence) =>
      occurrence.startAt >= new Date() && occurrence.status === 'SCHEDULED',
  );
  const completed = instructor.classOccurrences.filter(
    (occurrence) =>
      occurrence.startAt < new Date() || occurrence.status === 'COMPLETED',
  );
  const bookedSeats = instructor.classOccurrences.reduce(
    (total, occurrence) =>
      total + occurrence._count.bookings + occurrence.historicalSignupCount,
    0,
  );
  const referralCode = instructor.referralCodes[0];
  const isOwnerInstructor = ['vanessa@rhyzefit.com', 'melissa@rhyzefit.com'].includes(instructor.email.toLowerCase());
  const standardRateCents = isOwnerInstructor ? 0 : (instructor.instructorProfile?.standardClassRateCents ?? 4_000);

  return (
    <>
      <Link
        href="/admin/instructors"
        className="text-xs font-black uppercase tracking-widest text-rhyze-coral"
      >
        ← Instructor directory
      </Link>
      <div className="mt-5 grid gap-6 lg:grid-cols-[auto_1fr] lg:items-end">
        {instructor.instructorProfile?.photoUrl ? (
          <Image
            src={instructor.instructorProfile.photoUrl}
            alt=""
            width={128}
            height={128}
            unoptimized={instructor.instructorProfile.photoUrl.startsWith('/api/media/')}
            className="h-32 w-32 object-cover"
          />
        ) : (
          <div className="grid h-32 w-32 place-items-center bg-rhyze-orange/10 font-display text-5xl">
            {(instructor.name || instructor.email).slice(0, 1)}
          </div>
        )}
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
            Instructor record + credential review
          </p>
          <h1 className="mt-3 font-display text-6xl tracking-wider md:text-8xl">
            {instructor.name || 'INSTRUCTOR'}
          </h1>
          <div className="mt-3 flex flex-wrap gap-3 text-sm font-bold text-rhyze-black/55">
            <span>{instructor.email}</span>
            <span>·</span>
            <span>{instructor.memberProfile?.phone || 'Phone not provided'}</span>
            {referralCode && (
              <>
                <span>·</span>
                <strong className="text-rhyze-coral">{referralCode.code}</strong>
              </>
            )}
          </div>
        </div>
      </div>

      {searchParams.saved && (
        <p className="mt-5 border-l-4 border-emerald-600 bg-emerald-50 p-4 font-bold">
          {searchParams.saved === 'credential'
            ? 'Credential uploaded securely for review.'
            : 'Public instructor profile updated.'}
        </p>
      )}
      {searchParams.error === 'photo' && (
        <p className="mt-5 border-l-4 border-rhyze-coral bg-white p-4 font-bold">
          Use a JPG or PNG image within the upload size limit.
        </p>
      )}
      {searchParams.error === 'document' && (
        <p className="mt-5 border-l-4 border-rhyze-coral bg-white p-4 font-bold">
          Use a PDF, JPG, or PNG no larger than 8 MB.
        </p>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Assigned class dates" value={`${instructor.classOccurrences.length}`} detail={`${upcoming.length} upcoming · ${completed.length} past`} href="#assigned-classes" />
        <Metric label="Booked seats" value={`${bookedSeats}`} detail="Confirmed named rosters" href="#assigned-classes" />
        <Metric label="Referral commission" value={money(commissionTotal)} detail={`${money(availableCommissionTotal)} available for payout · ${money(paidCommissionTotal)} paid`} href="#referrals" />
        <Metric label="Standard class pay" value={money(standardRateCents)} detail="Admin-set rate per standard class" href="#pay-rates" />
        <Metric label="Specialty event pay rate" value={instructor.instructorProfile?.specialtyEventRateText || (instructor.instructorProfile?.specialtyEventRateCents == null ? 'Not set' : money(instructor.instructorProfile.specialtyEventRateCents))} detail="Admin-set event agreement" href="#pay-rates" compact />
      </div>

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <div className="grid gap-6">
          <form
            action={updateInstructorDirectoryAction}
            className="grid gap-4 border-t-4 border-rhyze-orange bg-white p-6 md:grid-cols-2"
          >
            <input type="hidden" name="userId" value={instructor.id} />
            <label className="grid gap-2">
              <Span>Public name</Span>
              <input
                name="name"
                defaultValue={instructor.name || ''}
                required
                className="min-h-12 border px-3"
              />
            </label>
            <label className="grid gap-2">
              <Span>Upload photo</Span>
              <input
                type="file"
                name="photo"
                accept="image/jpeg,image/png"
                className="min-h-12 border bg-rhyze-orange/10 p-3"
              />
            </label>
            <label className="grid gap-2 md:col-span-2">
              <Span>Public bio</Span>
              <textarea
                name="bio"
                defaultValue={instructor.instructorProfile?.bio || ''}
                className="min-h-48 border p-3"
              />
            </label>
            <div id="pay-rates" className="grid gap-4 md:col-span-2 md:grid-cols-2">
              <label className="grid gap-2">
                <Span>Standard class pay rate</Span>
                <div className="flex min-h-12 items-center border bg-white px-3">
                  <span className="mr-2 font-bold">$</span>
                  <input name="standardClassRate" type="number" min="0" step="0.01" defaultValue={(standardRateCents / 100).toFixed(2)} readOnly={isOwnerInstructor} className="min-w-0 flex-1 outline-none read-only:cursor-not-allowed read-only:opacity-60" />
                </div>
              </label>
              <label className="grid gap-2">
                <Span>Specialty event pay rate</Span>
                <textarea name="specialtyEventRateText" rows={3} maxLength={500} defaultValue={instructor.instructorProfile?.specialtyEventRateText || (instructor.instructorProfile?.specialtyEventRateCents == null ? '' : money(instructor.instructorProfile.specialtyEventRateCents))} placeholder="Example: 30% of net ticket sales, or $75 flat rate" className="border p-3" />
              </label>
            </div>
            <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest md:col-span-2">
              Save and publish profile
            </button>
          </form>

          <section id="assigned-classes" className="scroll-mt-24 border-t-4 border-rhyze-gold bg-white p-5">
            <h2 className="font-display text-4xl tracking-wider">ASSIGNED CLASSES</h2>
            <div className="mt-3 divide-y divide-black/10">
              {instructor.classOccurrences.map((item) => (
                <Link
                  key={item.id}
                  href={adminRosterHref(item.id)}
                  className="grid gap-1 py-3 transition hover:bg-orange-50 hover:text-rhyze-coral md:grid-cols-[1fr_auto]"
                >
                  <span>
                    <strong className="block">{item.template.name}</strong>
                    <small className="text-rhyze-black/45">
                      {item._count.bookings + item.historicalSignupCount}/{item.capacity} booked
                    </small>
                  </span>
                  <span className="text-left md:text-right">
                    <span className="block text-sm font-bold">{date(item.startAt)}</span>
                    <span className="mt-1 block text-[10px] font-black uppercase tracking-widest text-rhyze-coral">View attendees →</span>
                  </span>
                </Link>
              ))}
              {!instructor.classOccurrences.length && (
                <p className="py-4 text-rhyze-black/50">No classes assigned.</p>
              )}
            </div>
          </section>
        </div>

        <div className="grid gap-6">
          <section id="referrals" className="scroll-mt-24 border-t-4 border-rhyze-orange bg-white p-5">
            <h2 className="font-display text-4xl tracking-wider">REFERRALS</h2>
            <p className="mt-2 text-sm font-bold text-rhyze-black/50">
              Code: {referralCode?.code || 'Awaiting approval'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ['week', 'Weekly'],
                ['biweek', 'Bi-weekly'],
                ['month', 'Monthly'],
              ].map(([value, label]) => (
                <Link key={value} href={`/admin/instructors/${instructor.id}?period=${value}#referrals`} className={`px-3 py-2 text-[10px] font-black uppercase ${period === value ? 'bg-rhyze-black text-white' : 'border border-rhyze-black'}`}>{label}</Link>
              ))}
            </div>
            <form className="mt-3 grid gap-2 border border-rhyze-orange/25 bg-orange-50 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <input type="hidden" name="period" value="custom" />
              <label className="grid gap-1 text-[10px] font-black uppercase">From date<input type="date" name="from" defaultValue={searchParams.from} required className="min-h-10 border bg-white px-2 text-sm font-normal" /></label>
              <label className="grid gap-1 text-[10px] font-black uppercase">To date<input type="date" name="to" defaultValue={searchParams.to} required className="min-h-10 border bg-white px-2 text-sm font-normal" /></label>
              <button className="min-h-10 bg-rhyze-black px-4 text-[10px] font-black uppercase text-white">Apply dates</button>
            </form>
            <p className="mt-4 text-sm font-black">Available for payout: {money(availableCommissionTotal)}</p>
            <p className="mt-1 text-xs font-bold text-rhyze-black/50">Paid: {money(paidCommissionTotal)} · Total generated: {money(commissionTotal)}</p>
            <div className="mt-2 divide-y divide-black/10">
              {filteredCommissions.map((item) => (
                <div key={item.id} className="grid gap-1 py-3 md:grid-cols-[1fr_auto]">
                  <span>
                    <strong className="block">
                      {item.referredUser.name || item.referredUser.email}
                    </strong>
                    <small className="text-rhyze-black/45">
                      {item.purchase.product.name} · {date(item.earnedAt)} · {item.status}
                    </small>
                  </span>
                  <strong>{money(item.amountCents)}</strong>
                </div>
              ))}
              {!filteredCommissions.length && (
                <p className="py-5 text-sm font-bold text-rhyze-black/45">
                  No qualifying commission purchases yet.
                </p>
              )}
            </div>
          </section>

          <section className="border-t-4 border-rhyze-coral bg-white p-5">
            <h2 className="font-display text-4xl tracking-wider">COMPLIANCE</h2>
            <div className="mt-4 grid gap-3">
              <StatusRow
                label="Instructor status"
                status={instructor.instructorProfile?.isActive ? 'Approved' : 'Revoked'}
              />
              <form action={updateInstructorStatusAction} className="flex flex-wrap gap-2 pt-2">
                <input type="hidden" name="userId" value={instructor.id} />
                {instructor.instructorProfile?.isActive ? (
                  <button name="statusAction" value="REVOKE" className="border border-red-700 bg-red-100 px-4 py-2 text-[10px] font-black uppercase text-red-900">Revoke instructor access</button>
                ) : (
                  <button name="statusAction" value="APPROVE" className="bg-rhyze-black px-4 py-2 text-[10px] font-black uppercase text-white">Approve instructor access</button>
                )}
              </form>
            </div>
          </section>

          <section
            id="credential-upload"
            className="scroll-mt-24 border-t-4 border-rhyze-gold bg-orange-50 p-5"
          >
            <h2 className="font-display text-4xl tracking-wider">
              INSURANCE + CPR
            </h2>
            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              {(['INSURANCE', 'CPR'] as const).map((type) => {
                const typeCredentials = instructor.instructorCredentials.filter(
                  (item) => item.type === type,
                );
                const latest = typeCredentials[0];

                return (
                  <article
                    key={type}
                    className="min-w-0 border border-rhyze-orange/30 bg-[#fff4e8] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-lg">
                        {type === 'CPR'
                          ? 'CPR Certification'
                          : 'Instructor Insurance'}
                      </strong>
                      <AdminStatusBadge status={latest?.status || 'Missing'} />
                    </div>
                    <p className="mt-1 text-xs font-bold text-rhyze-black/50">
                      {latest
                        ? latest.expiresAt
                          ? `Expires ${date(latest.expiresAt)}`
                          : 'No expiration date provided'
                        : 'No document uploaded'}
                    </p>

                    <form
                      action={adminUploadCredentialAction}
                      className="mt-4 grid min-w-0 gap-3"
                    >
                      <input type="hidden" name="instructorId" value={instructor.id} />
                      <input type="hidden" name="type" value={type} />
                      <label className="grid min-w-0 gap-1 text-xs font-black uppercase">
                        Document
                        <input
                          type="file"
                          name="document"
                          accept=".pdf,image/jpeg,image/png"
                          required
                          className="w-full min-w-0 overflow-hidden border border-rhyze-orange/30 bg-white p-2 text-sm font-normal file:mr-3 file:border-0 file:bg-rhyze-orange/15 file:px-3 file:py-2 file:font-bold"
                        />
                      </label>
                      <label className="grid min-w-0 gap-1 text-xs font-black uppercase">
                        Expiration date
                        <span className="normal-case text-rhyze-black/45">
                          Optional
                        </span>
                        <input
                          type="date"
                          name="expiresAt"
                          className="min-h-11 w-full min-w-0 border border-rhyze-orange/30 bg-white px-3 text-sm font-normal"
                        />
                      </label>
                      <button className="bg-rhyze-black px-4 py-3 text-xs font-black uppercase text-white">
                        Upload securely
                      </button>
                    </form>

                    {!!typeCredentials.length && (
                      <div className="mt-5 divide-y divide-rhyze-orange/20 border-t border-rhyze-orange/25">
                        {typeCredentials.map((item) => (
                          <div key={item.id} className="grid gap-3 py-4">
                            <div>
                              <p className="break-all text-sm font-bold">
                                {item.originalFilename}
                              </p>
                              <p className="mt-1 text-xs text-rhyze-black/50">
                                {item.status} · uploaded {date(item.createdAt)}
                              </p>
                              <Link
                                href={`/api/credentials/${item.id}`}
                                className="mt-2 inline-block text-xs font-black uppercase text-rhyze-coral"
                              >
                                Private download
                              </Link>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <form action={reviewCredentialAction}>
                                <input type="hidden" name="credentialId" value={item.id} />
                                <input type="hidden" name="status" value="VALID" />
                                <button className="bg-rhyze-black px-4 py-2 text-xs font-black uppercase text-white">
                                  Approve
                                </button>
                              </form>
                              <form action={reviewCredentialAction} className="flex min-w-0 flex-1">
                                <input type="hidden" name="credentialId" value={item.id} />
                                <input type="hidden" name="status" value="REJECTED" />
                                <input
                                  name="rejectionNote"
                                  placeholder="Reason"
                                  className="min-w-0 flex-1 border px-3 text-sm"
                                />
                                <button className="border border-rhyze-coral px-3 text-xs font-black uppercase text-rhyze-coral">
                                  Reject
                                </button>
                              </form>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>

      <form
        action={removeInstructorAction}
        className="mt-8 border-t border-rhyze-coral/30 pt-5"
      >
        <input type="hidden" name="userId" value={instructor.id} />
        <button className="border border-rhyze-coral px-4 py-3 text-xs font-black uppercase text-rhyze-coral">
          Remove from public instructor directory
        </button>
      </form>
    </>
  );
}

function Metric({
  label,
  value,
  detail,
  href,
  compact = false,
}: {
  label: string;
  value: string;
  detail: string;
  href: string;
  compact?: boolean;
}) {
  return (
    <Link href={href} className="border-t-4 border-rhyze-orange bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
      <p className="text-xs font-black uppercase tracking-widest text-rhyze-black/45">
        {label}
      </p>
      <strong className={`mt-2 block tracking-wider ${compact ? 'text-lg font-black leading-snug' : 'font-display text-5xl'}`}>{value}</strong>
      <span className="mt-2 block text-xs font-bold text-rhyze-black/40">{detail}</span>
    </Link>
  );
}

function StatusRow({
  label,
  status,
  detail,
  href,
}: {
  label: string;
  status: string;
  detail?: string;
  href?: string;
}) {
  const content = (
    <div className="border-b border-black/10 py-3">
      <div className="flex items-center justify-between gap-4">
        <strong className="text-sm">{label}</strong>
        <AdminStatusBadge status={status} />
      </div>
      {detail && <p className="mt-1 text-xs font-bold text-rhyze-black/40">{detail}</p>}
    </div>
  );
  return href ? <Link href={href} className="block hover:text-rhyze-coral">{content}</Link> : content;
}

function Span({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-black uppercase tracking-widest">{children}</span>;
}
