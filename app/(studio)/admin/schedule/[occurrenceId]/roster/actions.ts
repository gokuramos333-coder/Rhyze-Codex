'use server';
import { currentCreditProduct } from '@/lib/domain/credits/current-credit-product';
import { lockMembershipEntitlements } from '@/lib/domain/credits/entitlement-lock';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import {
  complimentaryStandardAccessCanBook,
  creditAccountCanBook,
  EVENT_CREDIT_LABEL_PREFIX,
  eventCreditCanBook,
  instructorStandardClassAccess,
  standardSingleClassCreditCanBook,
} from '@/lib/domain/bookings/booking-rules';
import { availableMembershipCredits } from '@/lib/domain/credits/membership-renewal';
import { vipCreditAccountCanBook, vipCreditBenefit, vipEntitlementInclude } from '@/lib/domain/credits/vip-access';
import { bookingPolicySnapshotWithAccess } from '@/lib/domain/bookings/booking-access';
import { accessTypeForProductKind } from '@/lib/domain/bookings/cancellation-policy';

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
      include: { template: true, instructor: true },
    });
    if (!occurrence || occurrence.status !== 'SCHEDULED') return 'unavailable';

    const member = await tx.user.findFirst({
      where: {
        AND: [{ OR: [
          { role: { in: ['MEMBER', 'INSTRUCTOR'] } },
          { role: { in: ['OWNER', 'ADMIN', 'MANAGER'] }, instructorProfile: { is: { isActive: true } } },
        ] }],
        status: 'ACTIVE',
        OR: [
          { email: { equals: memberQuery, mode: 'insensitive' } },
          { email: { contains: memberQuery, mode: 'insensitive' } },
          { name: { contains: memberQuery, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ email: 'asc' }],
      include: { instructorProfile: true, memberships: { include: vipEntitlementInclude } },
    });
    if (!member) return 'member-not-found';
    await lockMembershipEntitlements(tx, member.id);
    // The user search preceded the lock; reread paid entitlement after acquiring it.
    member.memberships = await tx.membership.findMany({ where: { userId: member.id }, include: vipEntitlementInclude });
    const now = new Date();
    const instructorAccess = instructorStandardClassAccess({ user: member, isEvent: occurrence.template.isEvent });

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
            membership: { select: { id: true, status: true, product: true } },
            product: { select: { includedCredits: true, kind: true, customPlanType: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const creditAccount = accounts.find((account) => {
      const productKind = currentCreditProduct(account)?.kind ?? null;
      const isEventCredit = eventCreditCanBook({
        label: account.label,
        sourceProductKind: productKind,
        isEvent: occurrence.template.isEvent,
        className: occurrence.template.name,
        instructorName: occurrence.instructor?.name ?? occurrence.instructor?.email,
      });
      const validEventAccess = occurrence.template.isEvent
        ? isEventCredit
        : true;
      const productAllowsOccurrence = complimentaryStandardAccessCanBook({
        customPlanType: currentCreditProduct(account)?.customPlanType,
        isEvent: occurrence.template.isEvent,
        durationMinutes: occurrence.template.durationMinutes,
      });
      const validSingleClassCredit = productKind !== 'DROP_IN' || standardSingleClassCreditCanBook({
        productKind,
        paidAt: account.sourcePurchase?.paidAt,
        occurrenceStartsAt: occurrence.startAt,
        isEvent: occurrence.template.isEvent,
        validUntil: account.validUntil,
      });
      return (
        productAllowsOccurrence &&
        validEventAccess &&
        creditAccountCanBook({ membershipStatus: account.sourcePurchase?.membership?.status ?? null }) &&
        vipCreditAccountCanBook({ account, memberships: member.memberships, now, occurrenceStartsAt: occurrence.startAt }) &&
        validSingleClassCredit &&
        (account.isUnlimited || creditBalance(
          account.entries,
          currentCreditProduct(account)?.includedCredits ?? null,
        ) > 0)
      );
    });
    if (!creditAccount && !instructorAccess) return 'member-no-credit';

    const accessProductKind = instructorAccess ? null : creditAccount && vipCreditBenefit(creditAccount) ? 'VIP' : currentCreditProduct(creditAccount)?.kind ?? null;
    const policySnapshot = bookingPolicySnapshotWithAccess({
      currentSnapshot: { creditAccountId: instructorAccess ? null : creditAccount?.id ?? null },
      accessType: instructorAccess ? 'COMPLIMENTARY' : accessTypeForProductKind(accessProductKind),
      accessProductKind,
    });

    const booking = await tx.booking.upsert({
      where: { occurrenceId_userId: { occurrenceId, userId: member.id } },
      update: { status: 'CONFIRMED', source: 'ADMIN_ADDED', cancelledAt: null, bookedAt: new Date(), policySnapshot },
      create: { occurrenceId, userId: member.id, source: 'ADMIN_ADDED', policySnapshot },
    });
    if (!instructorAccess && creditAccount && !creditAccount.isUnlimited) {
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
        after: { memberId: member.id, memberEmail: member.email, creditAccountId: instructorAccess ? null : creditAccount?.id, complimentaryInstructor: instructorAccess },
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
