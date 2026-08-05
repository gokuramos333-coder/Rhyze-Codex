'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import {
  cancellationOutcome,
  complimentaryStandardAccessCanBook,
  creditAccountCanBook,
  instructorAugustStandardClassAccess,
  standardSingleClassCreditCanBook,
  waitlistAvailability,
} from '@/lib/domain/bookings/booking-rules';
import { queueEmail } from '@/lib/notifications/email-queue';
import {
  evaluateIntroTrialBooking,
  INTRO_TRIAL_REMINDER_LEAD_MS,
} from '@/lib/domain/bookings/intro-trial-rules';
import { bookingWaiverDestination } from '@/lib/domain/waivers/acceptance';
import { availableMembershipCredits } from '@/lib/domain/credits/membership-renewal';
import { notifyAdminBookingCancellation } from '@/lib/notifications/admin-booking-cancellations';

function emailDate(value: Date) {
  return value.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function emailTime(value: Date) {
  return value.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export async function bookOccurrenceAction(formData: FormData): Promise<void> {
  const user = await requireArea('member');
  const occurrenceId = String(formData.get('occurrenceId') || '');

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${occurrenceId}))`;
    const occurrence = await tx.classOccurrence.findUnique({
      where: { id: occurrenceId },
      include: { template: true, instructor: { select: { name: true } } },
    });
    if (!occurrence || occurrence.status !== 'SCHEDULED') return 'unavailable';

    const activeWaiver = await tx.waiverVersion.findFirst({
      where: { isActive: true, requiresSign: true },
      select: { id: true },
    });
    if (
      !activeWaiver ||
      !(await tx.waiverAcceptance.findUnique({
        where: {
          waiverVersionId_userId: {
            waiverVersionId: activeWaiver.id,
            userId: user.id,
          },
        },
      }))
    ) {
      return 'waiver';
    }

    if (
      await tx.booking.findUnique({
        where: { occurrenceId_userId: { occurrenceId, userId: user.id } },
      })
    ) {
      return 'duplicate';
    }

    const overlap = await tx.booking.findFirst({
      where: {
        userId: user.id,
        status: 'CONFIRMED',
        occurrence: {
          startAt: { lt: occurrence.endAt },
          endAt: { gt: occurrence.startAt },
        },
      },
    });
    if (overlap) return 'overlap';

    const nativeBooked = await tx.booking.count({
      where: { occurrenceId, status: 'CONFIRMED' },
    });
    const booked = nativeBooked + occurrence.historicalSignupCount;
    if (booked >= occurrence.capacity) {
      const existingWaitlist = await tx.waitlistEntry.findUnique({
        where: { occurrenceId_userId: { occurrenceId, userId: user.id } },
      });
      if (existingWaitlist?.status === 'WAITING') return 'waitlist';

      const waitingCount = await tx.waitlistEntry.count({
        where: { occurrenceId, status: 'WAITING' },
      });
      if (!waitlistAvailability(waitingCount).canJoin) return 'waitlist-full';

      const joinedAt = new Date();
      const waitlist = await tx.waitlistEntry.upsert({
        where: { occurrenceId_userId: { occurrenceId, userId: user.id } },
        update: { status: 'WAITING', joinedAt, promotedAt: null, leftAt: null },
        create: { occurrenceId, userId: user.id, joinedAt },
      });
      const waitlistPosition = await tx.waitlistEntry.count({
        where: { occurrenceId, status: 'WAITING', joinedAt: { lte: waitlist.joinedAt } },
      });
      await queueEmail(tx, {
        userId: user.id,
        to: user.email,
        subject: `You’re on the waitlist for ${occurrence.template.name}`,
        template: 'WAITLIST_JOINED',
        payload: {
          name: user.name || 'Rhyzer',
          className: occurrence.template.name,
          instructorName: occurrence.instructor?.name || 'Rhyze instructor',
          classDate: emailDate(occurrence.startAt),
          classTime: emailTime(occurrence.startAt),
          waitlistPosition: String(waitlistPosition),
          bookingsUrl: '/member/bookings',
        },
        dedupeKey: `waitlist-joined:${waitlist.id}:${joinedAt.toISOString()}`,
      });
      return 'waitlist';
    }

    const accounts = await tx.creditAccount.findMany({
      where: {
        userId: user.id,
        validFrom: { lte: new Date() },
        OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }],
      },
      include: {
        entries: true,
        sourcePurchase: {
          include: {
            membership: { select: { status: true } },
            product: { select: { includedCredits: true, kind: true, customPlanType: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const account = accounts.find(
      (item) => {
        const productKind = item.sourcePurchase?.product.kind ?? null;
        const isSingleClassCredit = productKind === 'DROP_IN';
        const productAllowsOccurrence = complimentaryStandardAccessCanBook({
          customPlanType: item.sourcePurchase?.product.customPlanType,
          isEvent: occurrence.template.isEvent,
          durationMinutes: occurrence.template.durationMinutes,
        });
        const validSingleClassCredit = !isSingleClassCredit || standardSingleClassCreditCanBook({
          productKind,
          paidAt: item.sourcePurchase?.paidAt,
          occurrenceStartsAt: occurrence.startAt,
          isEvent: occurrence.template.isEvent,
          validUntil: item.validUntil,
        });
        return (
          productAllowsOccurrence &&
          creditAccountCanBook({ membershipStatus: item.sourcePurchase?.membership?.status ?? null }) &&
          validSingleClassCredit &&
          (item.isUnlimited ||
            availableMembershipCredits({
              entries: item.entries,
              includedCredits: item.sourcePurchase?.product.includedCredits ?? null,
            }) > 0)
        );
      },
    );
    const trial = await tx.membership.findFirst({
      where: {
        userId: user.id,
        status: { in: ['TRIALING', 'ACTIVE'] },
        product: { kind: 'INTRO_TRIAL' },
      },
      orderBy: { createdAt: 'desc' },
    });
    const trialAccess = trial
      ? evaluateIntroTrialBooking({
          activatedAt: trial.activatedAt,
          occurrenceStartsAt: occurrence.startAt,
          now: new Date(),
          isEvent: occurrence.template.isEvent,
        })
      : null;
    if (trial && trialAccess && !trialAccess.allowed && trialAccess.reason === 'expired') {
      await tx.membership.update({ where: { id: trial.id }, data: { status: 'EXPIRED' } });
    }
    const instructorAugustAccess = instructorAugustStandardClassAccess({
      role: user.role,
      occurrenceStartsAt: occurrence.startAt,
      isEvent: occurrence.template.isEvent,
    });
    if (!account && !instructorAugustAccess && (!trialAccess || !trialAccess.allowed)) {
      if (trialAccess?.reason === 'not-open') return 'trial-not-open';
      if (trialAccess?.reason === 'event-excluded') return 'trial-event';
      if (trialAccess?.reason === 'outside-window' || trialAccess?.reason === 'expired') return 'trial-window';
      return 'access';
    }
    const booking = await tx.booking.create({
      data: { occurrenceId, userId: user.id },
    });
    if (!account && trial && trialAccess?.allowed && !trial.activatedAt) {
      await tx.membership.update({
        where: { id: trial.id },
        data: {
          activatedAt: trialAccess.activatesAt,
          currentPeriodStart: trialAccess.activatesAt,
          currentPeriodEnd: trialAccess.expiresAt,
          status: 'TRIALING',
        },
      });
      await queueEmail(tx, {
        userId: user.id,
        to: user.email,
        subject: 'Your Rhyze intro week ends tomorrow',
        template: 'TRIAL_ENDING',
        payload: {
          name: user.name || 'Rhyzer',
          expiresAt: trialAccess.expiresAt.toISOString(),
          membershipUrl: '/memberships',
          plans: ['Elevate', 'Ritual', 'VIP Access'],
        },
        scheduledFor: new Date(
          trialAccess.expiresAt.getTime() - INTRO_TRIAL_REMINDER_LEAD_MS,
        ),
        dedupeKey: `trial-ending:${trial.id}`,
      });
    }
    await queueEmail(tx, {
      userId: user.id,
      to: user.email,
      subject: `You’re booked for ${occurrence.template.name}`,
      template: 'BOOKING_CONFIRMATION',
      payload: {
        name: user.name || 'Rhyzer',
        className: occurrence.template.name,
        instructorName: occurrence.instructor?.name || 'Rhyze instructor',
        classDate: emailDate(occurrence.startAt),
        classTime: emailTime(occurrence.startAt),
        bookingsUrl: '/member/bookings',
      },
    });
    await queueEmail(tx, {
      userId: user.id,
      to: user.email,
      subject: `${occurrence.template.name} is tomorrow`,
      template: 'CLASS_REMINDER',
      payload: {
        name: user.name || 'Rhyzer',
        className: occurrence.template.name,
        instructorName: occurrence.instructor?.name || 'Rhyze instructor',
        classDate: emailDate(occurrence.startAt),
        classTime: emailTime(occurrence.startAt),
        bookingsUrl: '/member/bookings',
      },
      scheduledFor: new Date(occurrence.startAt.getTime() - 24 * 60 * 60 * 1000),
    });
    if (account && !account.isUnlimited) {
      await tx.creditLedgerEntry.create({
        data: {
          creditAccountId: account.id,
          bookingId: booking.id,
          type: 'RESERVE',
          quantity: -1,
          reason: 'Class booking',
        },
      });
    }
    return 'confirmed';
  });

  revalidatePath('/member/bookings');
  revalidatePath('/schedule');
  if (result === 'waiver') {
    redirect(bookingWaiverDestination(occurrenceId));
  }
  redirect(`/member/bookings?result=${result}`);
}

export async function cancelBookingAction(formData: FormData): Promise<void> {
  const user = await requireArea('member');
  const bookingId = String(formData.get('bookingId') || '');
  await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findFirst({
      where: { id: bookingId, userId: user.id, status: 'CONFIRMED' },
      include: { occurrence: { include: { template: true } } },
    });
    if (!booking) return;
    const outcome = cancellationOutcome(
      booking.occurrence.startAt,
      new Date(),
      120,
    );
    await tx.booking.update({
      where: { id: booking.id },
      data: { status: outcome.status, cancelledAt: new Date() },
    });
    await queueEmail(tx, {
      userId: user.id,
      to: user.email,
      subject: `${booking.occurrence.template.name} booking was cancelled`,
      template: 'BOOKING_CANCELLATION',
      payload: {
        name: user.name || 'Rhyzer',
        className: booking.occurrence.template.name,
        classDate: emailDate(booking.occurrence.startAt),
        classTime: emailTime(booking.occurrence.startAt),
        creditResult: outcome.restoreCredit
          ? 'Your class credit was returned to your account.'
          : 'This cancellation falls inside the late-cancel window, so the credit was not returned.',
        bookingsUrl: '/member/bookings',
      },
    });
    const reservation = await tx.creditLedgerEntry.findFirst({
      where: { bookingId: booking.id, type: 'RESERVE' },
    });
    const creditReturned = Boolean(reservation && outcome.restoreCredit);
    if (reservation && outcome.restoreCredit) {
      await tx.creditLedgerEntry.create({
        data: {
          creditAccountId: reservation.creditAccountId,
          bookingId: booking.id,
          type: 'RELEASE',
          quantity: 1,
          reason: 'Booking cancelled',
        },
      });
    }
    await notifyAdminBookingCancellation(tx, {
      bookingId: booking.id,
      memberId: user.id,
      memberName: user.name,
      memberEmail: user.email,
      occurrenceId: booking.occurrenceId,
      className: booking.occurrence.template.name,
      classDate: emailDate(booking.occurrence.startAt),
      classTime: emailTime(booking.occurrence.startAt),
      status: outcome.status,
      creditReturned,
    });
    if (outcome.status === 'CANCELLED') {
      const next = await tx.waitlistEntry.findFirst({
        where: { occurrenceId: booking.occurrenceId, status: 'WAITING' },
        include: { user: true },
        orderBy: { joinedAt: 'asc' },
      });
      if (next) {
        const account = await tx.creditAccount.findFirst({
          where: {
            userId: next.userId,
            validFrom: { lte: new Date() },
            AND: [
              { OR: [{ validUntil: null }, { validUntil: { gt: new Date() } }] },
              { OR: [{ isUnlimited: true }, { entries: { some: {} } }] },
            ],
          },
          include: {
            entries: true,
            sourcePurchase: {
              include: {
                membership: { select: { status: true } },
                product: { select: { includedCredits: true, customPlanType: true } },
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        });
        const balance = account
          ? availableMembershipCredits({
              entries: account.entries,
              includedCredits: account.sourcePurchase?.product.includedCredits ?? null,
            })
          : 0;
        const accountHasAccess = Boolean(
          account &&
          complimentaryStandardAccessCanBook({
            customPlanType: account.sourcePurchase?.product.customPlanType,
            isEvent: booking.occurrence.template.isEvent,
            durationMinutes: booking.occurrence.template.durationMinutes,
          }) &&
          creditAccountCanBook({ membershipStatus: account.sourcePurchase?.membership?.status ?? null }) &&
          (account.isUnlimited || balance > 0),
        );
        const trial = await tx.membership.findFirst({
          where: {
            userId: next.userId,
            status: { in: ['TRIALING', 'ACTIVE'] },
            product: { kind: 'INTRO_TRIAL' },
          },
          orderBy: { createdAt: 'desc' },
        });
        const trialAccess = trial
          ? evaluateIntroTrialBooking({
              activatedAt: trial.activatedAt,
              occurrenceStartsAt: booking.occurrence.startAt,
              now: new Date(),
              isEvent: booking.occurrence.template.isEvent,
            })
          : null;
        if (accountHasAccess || trialAccess?.allowed) {
          const promoted = await tx.booking.create({
            data: { occurrenceId: booking.occurrenceId, userId: next.userId, source: 'WAITLIST' },
          });
          if (accountHasAccess && account && !account.isUnlimited) {
            await tx.creditLedgerEntry.create({
              data: { creditAccountId: account.id, bookingId: promoted.id, type: 'RESERVE', quantity: -1, reason: 'Waitlist promotion' },
            });
          }
          if (!accountHasAccess && trial && trialAccess?.allowed && !trial.activatedAt) {
            await tx.membership.update({
              where: { id: trial.id },
              data: {
                activatedAt: trialAccess.activatesAt,
                currentPeriodStart: trialAccess.activatesAt,
                currentPeriodEnd: trialAccess.expiresAt,
                status: 'TRIALING',
              },
            });
            await queueEmail(tx, {
              userId: next.userId,
              to: next.user.email,
              subject: 'Your Rhyze intro week ends tomorrow',
              template: 'TRIAL_ENDING',
              payload: {
                name: next.user.name || 'Rhyzer',
                expiresAt: trialAccess.expiresAt.toISOString(),
                membershipUrl: '/memberships',
                plans: ['Elevate', 'Ritual', 'VIP Access'],
              },
              scheduledFor: new Date(
                trialAccess.expiresAt.getTime() - INTRO_TRIAL_REMINDER_LEAD_MS,
              ),
              dedupeKey: `trial-ending:${trial.id}`,
            });
          }
          await tx.waitlistEntry.update({ where: { id: next.id }, data: { status: 'PROMOTED', promotedAt: new Date() } });
          await queueEmail(tx, {
            userId: next.userId,
            to: next.user.email,
            subject: 'You are off the Rhyze waitlist',
            template: 'WAITLIST_PROMOTED',
            payload: {
              name: next.user.name || 'Rhyzer',
              className: booking.occurrence.template.name,
              classDate: emailDate(booking.occurrence.startAt),
              classTime: emailTime(booking.occurrence.startAt),
              bookingsUrl: '/member/bookings',
            },
          });
        } else {
          await queueEmail(tx, {
            userId: next.userId,
            to: next.user.email,
            subject: `A spot is ready to claim in ${booking.occurrence.template.name}`,
            template: 'WAITLIST_SPOT_AVAILABLE',
            payload: {
              name: next.user.name || 'Rhyzer',
              className: booking.occurrence.template.name,
              instructorName: 'Rhyze instructor',
              classDate: emailDate(booking.occurrence.startAt),
              classTime: emailTime(booking.occurrence.startAt),
              claimUrl: booking.occurrence.template.isEvent
                ? `/book/event/${booking.occurrence.template.slug}`
                : `/book/${booking.occurrence.template.slug}?occurrence=${booking.occurrence.id}`,
            },
            dedupeKey: `waitlist-spot-available:${next.id}`,
          });
        }
      }
    }
  });
  revalidatePath('/member/bookings');
}

export async function leaveWaitlistAction(formData: FormData): Promise<void> {
  const user = await requireArea('member');
  const waitlistId = String(formData.get('waitlistId') || '');
  await prisma.waitlistEntry.updateMany({
    where: { id: waitlistId, userId: user.id, status: 'WAITING' },
    data: { status: 'LEFT', leftAt: new Date() },
  });
  revalidatePath('/member/bookings');
}
