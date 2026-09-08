'use server';

import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { queueEmail } from '@/lib/notifications/email-queue';
import { generateReferralCode } from '@/lib/domain/onboarding/referral-code';
import { redirect } from 'next/navigation';
import { deleteObject, putPublicImage } from '@/lib/storage/object-storage';
import { requireApprovedOwner } from '@/lib/auth/session';
import {
  instructorStatusTransition,
  type InstructorStatusAction,
} from '@/lib/domain/instructors/instructor-status';
import { issueAccountClaim } from '@/lib/domain/accounts/account-claim-service';
import { prismaAccountClaimRepository } from '@/lib/domain/accounts/prisma-account-claim-repository';
import { INSTRUCTOR_ACCESS_CODE } from '@/lib/domain/onboarding/instructor-application';

function dollarsToCents(value: FormDataEntryValue | null) {
  const text = String(value || '').trim();
  if (!text) return null;
  const amount = Number(text);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

export async function createInstructorAction(formData: FormData) {
  const actor = await requireArea('admin');
  const name = String(formData.get('name') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const bio = String(formData.get('bio') || '').trim();
  let photoUrl: string | null = null;
  const photo = formData.get('photo');
  if (!name || !email || !email.includes('@')) redirect('/admin/instructors?error=invalid');
  if (photo instanceof File && photo.size > 0) {
    try {
      photoUrl = await putPublicImage(photo);
    } catch {
      redirect('/admin/instructors?error=photo');
    }
  }
  const [existing, lastOrder] = await Promise.all([
    prisma.user.findUnique({
      where: { email },
      include: { instructorProfile: true },
    }),
    prisma.instructorProfile.aggregate({ _max: { displayOrder: true } }),
  ]);
  if (
    existing &&
    (!['MEMBER', 'INSTRUCTOR'].includes(existing.role) ||
      !['ACTIVE', 'INVITED'].includes(existing.status) ||
      (existing.role === 'INSTRUCTOR' && existing.instructorProfile?.isActive))
  ) {
    redirect('/admin/instructors?error=exists');
  }

  const invited = await prisma.$transaction(async (tx) => {
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: { name, role: 'MEMBER', ...(photoUrl ? { image: photoUrl } : {}) },
        })
      : await tx.user.create({
          data: {
            name,
            email,
            image: photoUrl,
            role: 'MEMBER',
            status: 'INVITED',
          },
        });
    await tx.instructorProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        bio: bio || null,
        photoUrl,
        isActive: false,
        canEditOwnProfile: true,
        displayOrder: (lastOrder._max.displayOrder ?? -1) + 1,
      },
      update: {
        ...(bio ? { bio } : {}),
        ...(photoUrl ? { photoUrl } : {}),
        isActive: false,
        canEditOwnProfile: true,
      },
    });
    await tx.inAppNotification.upsert({
      where: { dedupeKey: `manual-instructor-invite:${user.id}` },
      create: {
        userId: user.id,
        title: 'Welcome to the Rhyze Tribe team',
        body: `Enter the instructor access code ${INSTRUCTOR_ACCESS_CODE}. Management will approve your instructor access after you submit it.`,
        link: '/member/instructor-access',
        dedupeKey: `manual-instructor-invite:${user.id}`,
      },
      update: {
        title: 'Welcome to the Rhyze Tribe team',
        body: `Enter the instructor access code ${INSTRUCTOR_ACCESS_CODE}. Management will approve your instructor access after you submit it.`,
        link: '/member/instructor-access',
        readAt: null,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'instructor.invited',
        entityType: 'User',
        entityId: user.id,
        after: { existingMember: Boolean(existing), bioProvided: Boolean(bio), photoProvided: Boolean(photoUrl) },
      },
    });
    return user;
  });

  let activationUrl = '/member/instructor-access';
  if (invited.status === 'INVITED' && !invited.passwordHash) {
    const claim = await issueAccountClaim(invited.id, prismaAccountClaimRepository);
    activationUrl = `/claim-account/${encodeURIComponent(claim.rawToken)}`;
  }
  await queueEmail(prisma, {
    userId: invited.id,
    to: invited.email,
    subject: 'Welcome to the Rhyze Tribe team',
    template: 'INSTRUCTOR_WELCOME_INVITE',
    payload: {
      name: invited.name || name,
      instructorCode: INSTRUCTOR_ACCESS_CODE,
      activationUrl,
    },
    dedupeKey: `instructor-welcome-invite:${invited.id}`,
  });
  revalidatePath('/admin/instructors');
  revalidatePath('/instructors');
  redirect('/admin/instructors?saved=invited');
}

export async function updateInstructorDirectoryAction(formData: FormData) {
  await requireArea('admin');
  const userId = String(formData.get('userId') || '');
  const name = String(formData.get('name') || '').trim();
  const bio = String(formData.get('bio') || '').trim();
  const photo = formData.get('photo');
  const requestedStandardRate = dollarsToCents(formData.get('standardClassRate')) ?? 4_000;
  const specialtyEventRateCents = dollarsToCents(formData.get('specialtyEventRate'));
  const specialtyEventRateText = String(formData.get('specialtyEventRateText') || '').trim().slice(0, 500) || null;
  if (!userId || !name) redirect('/admin/instructors?error=invalid');

  const [current, instructorUser] = await Promise.all([
    prisma.instructorProfile.findUnique({ where: { userId }, select: { photoUrl: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
  ]);
  const isOwnerInstructor = ['vanessa@rhyzefit.com', 'melissa@rhyzefit.com'].includes(instructorUser?.email.toLowerCase() || '');
  const standardClassRateCents = isOwnerInstructor ? 0 : requestedStandardRate;
  let nextPhotoUrl = current?.photoUrl || null;
  if (photo instanceof File && photo.size > 0) {
    try {
      nextPhotoUrl = await putPublicImage(photo);
    } catch {
      redirect(`/admin/instructors/${userId}?error=photo`);
    }
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      image: nextPhotoUrl,
      instructorProfile: {
        upsert: {
          create: { bio, photoUrl: nextPhotoUrl, isActive: true, canEditOwnProfile: true, standardClassRateCents, specialtyEventRateCents, specialtyEventRateText },
          update: { bio, photoUrl: nextPhotoUrl, isActive: true, standardClassRateCents, specialtyEventRateCents, specialtyEventRateText },
        },
      },
    },
  });
  if (
    nextPhotoUrl !== current?.photoUrl &&
    (current?.photoUrl?.startsWith('/uploads/profiles/') ||
      current?.photoUrl?.startsWith('/api/media/'))
  ) {
    await deleteObject(current.photoUrl);
  }
  revalidatePath('/admin/instructors');
  revalidatePath(`/admin/instructors/${userId}`);
  revalidatePath('/instructors');
  redirect(`/admin/instructors/${userId}?saved=profile`);
}

export async function updateInstructorStatusAction(formData: FormData) {
  const actor = await requireApprovedOwner();
  const userId = String(formData.get('userId') || '');
  const action = String(formData.get('statusAction') || '') as InstructorStatusAction;
  if (!userId || !['APPROVE', 'REVOKE'].includes(action)) {
    redirect('/admin/instructors?error=status');
  }
  const transition = instructorStatusTransition(action);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role: transition.role } });
    await tx.instructorProfile.update({
      where: { userId },
      data: { isActive: transition.profileActive },
    });
    await tx.instructorApplication.upsert({
      where: { userId },
      create: {
        userId,
        status: transition.applicationStatus,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
      update: {
        status: transition.applicationStatus,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
    });
    await tx.referralCode.updateMany({
      where: { instructorId: userId },
      data: {
        isActive: transition.referralActive,
        deactivatedAt: transition.referralActive ? null : new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: action === 'APPROVE' ? 'instructor.restored' : 'instructor.revoked',
        entityType: 'User',
        entityId: userId,
        after: transition,
      },
    });
  });
  revalidatePath('/admin/instructors');
  revalidatePath(`/admin/instructors/${userId}`);
  revalidatePath('/instructors');
  redirect(`/admin/instructors/${userId}?saved=status`);
}

export async function removeInstructorAction(formData: FormData) {
  const actor = await requireArea('admin');
  const userId = String(formData.get('userId') || '');
  if (!userId) redirect('/admin/instructors?error=invalid');
  const transition = instructorStatusTransition('REVOKE');
  await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!target) return;
    await tx.user.update({
      where: { id: userId },
      data: { role: target.role === 'INSTRUCTOR' ? transition.role : target.role },
    });
    await tx.instructorProfile.updateMany({
      where: { userId },
      data: { isActive: transition.profileActive },
    });
    await tx.instructorApplication.upsert({
      where: { userId },
      create: {
        userId,
        status: transition.applicationStatus,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
      update: {
        status: transition.applicationStatus,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
    });
    await tx.referralCode.updateMany({
      where: { instructorId: userId },
      data: { isActive: false, deactivatedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'instructor.removed',
        entityType: 'User',
        entityId: userId,
        after: transition,
      },
    });
  });
  revalidatePath('/admin/instructors');
  revalidatePath('/instructors');
  redirect('/admin/instructors?saved=removed');
}

export async function saveInstructorOrderAction(formData: FormData) {
  await requireArea('admin');
  const ids = String(formData.get('orderedIds') || '').split(',').filter(Boolean);
  await prisma.$transaction(
    ids.map((userId, displayOrder) =>
      prisma.instructorProfile.updateMany({
        where: { userId },
        data: { displayOrder },
      }),
    ),
  );
  revalidatePath('/admin/instructors');
  revalidatePath('/instructors');
  redirect('/admin/instructors?saved=order');
}

export async function approveInstructorAction(formData: FormData) {
  const actor = await requireArea('admin');
  const applicationId = String(formData.get('applicationId') || '');
  await prisma.$transaction(async (tx) => {
    const application = await tx.instructorApplication.findFirst({
      where: { id: applicationId, status: 'PENDING' },
      include: { user: true },
    });
    if (!application) return;
    const directoryMatch = application.user.name
      ? await tx.user.findFirst({
          where: {
            id: { not: application.userId },
            name: { equals: application.user.name, mode: 'insensitive' },
            instructorProfile: { is: { isActive: true } },
          },
          include: { instructorProfile: true },
        })
      : null;
    const lastOrder = await tx.instructorProfile.aggregate({ _max: { displayOrder: true } });
    await tx.user.update({ where: { id: application.userId }, data: { role: 'INSTRUCTOR' } });
    await tx.instructorProfile.upsert({
      where: { userId: application.userId },
      update: {
        isActive: true,
        canEditOwnProfile: true,
        bio: directoryMatch?.instructorProfile?.bio,
        photoUrl: directoryMatch?.instructorProfile?.photoUrl,
        displayOrder: directoryMatch?.instructorProfile?.displayOrder,
      },
      create: {
        userId: application.userId,
        isActive: true,
        canEditOwnProfile: true,
        bio: directoryMatch?.instructorProfile?.bio,
        photoUrl: directoryMatch?.instructorProfile?.photoUrl,
        displayOrder: directoryMatch?.instructorProfile?.displayOrder ?? (lastOrder._max.displayOrder ?? -1) + 1,
      },
    });
    if (directoryMatch) {
      await tx.classOccurrence.updateMany({ where: { instructorId: directoryMatch.id }, data: { instructorId: application.userId } });
      await tx.classSeries.updateMany({ where: { instructorId: directoryMatch.id }, data: { instructorId: application.userId } });
      await tx.referralCode.updateMany({ where: { instructorId: directoryMatch.id }, data: { instructorId: application.userId } });
      await tx.referralCommission.updateMany({ where: { instructorId: directoryMatch.id }, data: { instructorId: application.userId } });
      await tx.instructorProfile.update({ where: { userId: directoryMatch.id }, data: { isActive: false } });
    }
    let referral = await tx.referralCode.findFirst({
      where: { instructorId: application.userId, isActive: true },
    });
    if (!referral) {
      const existing = await tx.referralCode.findMany({ select: { code: true } });
      referral = await tx.referralCode.create({
        data: {
          instructorId: application.userId,
          code: generateReferralCode(application.user.name || 'Rhyzer', existing.map((item) => item.code)),
        },
      });
    }
    await tx.instructorApplication.update({
      where: { id: application.id },
      data: { status: 'APPROVED', reviewedById: actor.id, reviewedAt: new Date() },
    });
    await queueEmail(tx, {
      userId: application.userId,
      to: application.user.email,
      subject: 'Your Rhyze instructor access is approved',
      template: 'INSTRUCTOR_APPROVED',
      payload: {
        name: application.user.name || 'Instructor',
        referralCode: referral.code,
        instructorUrl: '/instructor',
      },
      dedupeKey: `instructor-approved:${application.id}`,
    });
    await queueEmail(tx, {
      userId: application.userId,
      to: application.user.email,
      subject: 'Complete your Rhyze instructor credentials',
      template: 'INSTRUCTOR_DOCUMENTS_MISSING',
      payload: {
        name: application.user.name || 'Instructor',
        missingDocuments: 'Instructor insurance and CPR certification',
        profileUrl: '/instructor/profile',
      },
      dedupeKey: `instructor-documents-missing:${application.id}`,
      scheduledFor: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: 'instructor.approved', entityType: 'User', entityId: application.userId },
    });
  });
  revalidatePath('/admin/instructors');
  revalidatePath('/instructors');
  revalidatePath('/schedule');
}

export async function rejectInstructorAction(formData: FormData) {
  const actor = await requireArea('admin');
  const applicationId = String(formData.get('applicationId') || '');
  const reviewNote = String(formData.get('reviewNote') || '').trim() || null;
  await prisma.$transaction(async (tx) => {
    const application = await tx.instructorApplication.findFirst({
      where: { id: applicationId, status: 'PENDING' },
      include: { user: true },
    });
    if (!application) return;
    await tx.instructorApplication.update({
      where: { id: application.id },
      data: { status: 'REJECTED', reviewedById: actor.id, reviewedAt: new Date(), reviewNote },
    });
    await queueEmail(tx, {
      userId: application.userId,
      to: application.user.email,
      subject: 'Update on your Rhyze instructor request',
      template: 'INSTRUCTOR_DENIED',
      payload: {
        name: application.user.name || 'there',
        reason: reviewNote || 'Reply to this email if you would like management to review your request again.',
        contactUrl: '/contact',
      },
      dedupeKey: `instructor-denied:${application.id}`,
    });
  });
  revalidatePath('/admin/instructors');
}
