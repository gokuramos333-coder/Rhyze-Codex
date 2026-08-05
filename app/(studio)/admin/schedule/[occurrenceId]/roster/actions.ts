'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import {
  complimentaryStandardAccessCanBook,
  creditAccountCanBook,
  standardSingleClassCreditCanBook,
} from '@/lib/domain/bookings/booking-rules';
import { availableMembershipCredits } from '@/lib/domain/credits/membership-renewal';

const ownerEmails = new Set([
  'vanessa@rhyzefit.com',
  'melissa@rhyzefit.com',
]);

function rosterPath(occurrenceId: string, result?: string) {
  return `/admin/schedule/${occurrenceId}/roster${result ? `?result=${result}` : ''}`;
}

function creditBalance(entries: { quantity: number }[], includedCredits: number | null) {
  return availableMembershipCredits({ entries, includedCredits });
}

export async function addMemberToClassAction(formData: FormData) {
  const actor = await requireApprovedOwner();
  const occurrenceId = String(formData.get('occurrenceId') || '');
  const memberQuery = String(formData.get('memberQuery') || '').trim();
  if (!occurrenceId || memberQuery.length < 2) redirect(rosterPath(occurrenceId, 'member-search'));

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${occurrenceId}))`;
    const occurrence = await tx.classOccurrence.findUnique({
      where: { id: occurrenceId },
      include: { template: true },
    });
    if (!occurrence || occurrence.status !== 'SCHEDULED') return 'unavailable';

    const member = await tx.user.findFirst({
      where: {
        role: { in: ['MEMBER', 'INSTRUCTOR'] },
        OR: [
          { email: { equals: memberQuery, mode: 'insensitive' } },
          { email: { contains: memberQuery, mode: 'insensitive' } },
          { name: { contains: memberQuery, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ email: 'asc' }],
    });
    if (!member) return 'member-not-found';

    const existing = await tx.booking.findUnique({
      where: { occurrenceId_userId: { occurrenceId, userId: member.id } },
    });
    if (existing && existing.status === 'CONFIRMED') return 'member-already-booked';

    const overlap = await tx.booking.findFirst({
      where: {
        userId: member.id,
        status: 'CONFIRMED',
        occurrence: {
          startAt: { lt: occurrence.endAt },
          endAt: { gt: occurrence.startAt },
        },
      },
    });
    if (overlap && overlap.occurrenceId !== occurrenceId) return 'member-overlap';

    const confirmed = await tx.booking.count({ where: { occurrenceId, status: 'CONFIRMED' } });
    if (confirmed + occurrence.historicalSignupCount >= occurrence.capacity) return 'full';

    const accounts = await tx.creditAccount.findMany({
      where: {
        userId: member.id,
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
    const creditAccount = accounts.find((account) => {
      const productKind = account.sourcePurchase?.product.kind ?? null;
      const productAllowsOccurrence = complimentaryStandardAccessCanBook({
        customPlanType: account.sourcePurchase?.product.customPlanType,
        isEvent: occurrence.template.isEvent,
        durationMinutes: occurrence.template.durationMinutes,
      });
      const validSingleClassCredit = productKind !== 'DROP_IN' || standardSingleClassCreditCanBook({
        productKind,
        paidAt: account.sourcePurchase?.paidAt,
        occurrenceStartsAt: occurrence.startAt,
        isEvent: occurrence.template.isEvent,
      });
      return (
        productAllowsOccurrence &&
        creditAccountCanBook({ membershipStatus: account.sourcePurchase?.membership?.status ?? null }) &&
        validSingleClassCredit &&
        (account.isUnlimited || creditBalance(
          account.entries,
          account.sourcePurchase?.product.includedCredits ?? null,
        ) > 0)
      );
    });
    if (!creditAccount) return 'member-no-credit';

    const booking = await tx.booking.upsert({
      where: { occurrenceId_userId: { occurrenceId, userId: member.id } },
      update: { status: 'CONFIRMED', source: 'ADMIN_ADDED', cancelledAt: null, bookedAt: new Date() },
      create: { occurrenceId, userId: member.id, source: 'ADMIN_ADDED' },
    });
    if (!creditAccount.isUnlimited) {
      await tx.creditLedgerEntry.create({
        data: {
          creditAccountId: creditAccount.id,
          bookingId: booking.id,
          type: 'RESERVE',
          quantity: -1,
          reason: 'Admin added member to class',
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'booking.admin-add-member',
        entityType: 'ClassOccurrence',
        entityId: occurrenceId,
        after: { memberId: member.id, memberEmail: member.email, creditAccountId: creditAccount.id },
      },
    });
    return 'member-added';
  });

  revalidatePath(rosterPath(occurrenceId));
  revalidatePath('/admin');
  revalidatePath('/schedule');
  revalidatePath('/member/bookings');
  redirect(rosterPath(occurrenceId, result));
}

export async function addOwnerComplimentaryBookingAction(formData: FormData) {
  const actor = await requireApprovedOwner();
  const occurrenceId = String(formData.get('occurrenceId') || '');
  const email = String(formData.get('email') || '').trim().toLowerCase();
  if (!occurrenceId || !ownerEmails.has(email)) return;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${occurrenceId}))`;
    const [occurrence, owner] = await Promise.all([
      tx.classOccurrence.findUnique({ where: { id: occurrenceId } }),
      tx.user.findUnique({ where: { email } }),
    ]);
    if (!occurrence || occurrence.status !== 'SCHEDULED' || !owner || owner.role !== 'OWNER') return;
    const confirmed = await tx.booking.count({ where: { occurrenceId, status: 'CONFIRMED' } });
    if (confirmed + occurrence.historicalSignupCount >= occurrence.capacity) return;

    await tx.booking.upsert({
      where: { occurrenceId_userId: { occurrenceId, userId: owner.id } },
      update: { status: 'CONFIRMED', source: 'OWNER_COMPLIMENTARY', cancelledAt: null, bookedAt: new Date() },
      create: { occurrenceId, userId: owner.id, source: 'OWNER_COMPLIMENTARY' },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'booking.owner-complimentary',
        entityType: 'ClassOccurrence',
        entityId: occurrenceId,
        after: { attendeeEmail: email },
      },
    });
  });

  revalidatePath(`/admin/schedule/${occurrenceId}/roster`);
  revalidatePath('/admin');
  revalidatePath('/schedule');
}
