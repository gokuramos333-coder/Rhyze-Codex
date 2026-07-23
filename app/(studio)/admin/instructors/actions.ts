'use server';

import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { queueEmail } from '@/lib/notifications/email-queue';
import { generateReferralCode } from '@/lib/domain/onboarding/referral-code';

export async function approveInstructorAction(formData: FormData) {
  const actor = await requireArea('admin');
  const applicationId = String(formData.get('applicationId') || '');
  await prisma.$transaction(async (tx) => {
    const application = await tx.instructorApplication.findFirst({
      where: { id: applicationId, status: 'PENDING' },
      include: { user: true },
    });
    if (!application) return;
    const existing = await tx.referralCode.findMany({ select: { code: true } });
    const code = generateReferralCode(application.user.name || 'Rhyzer', existing.map((item) => item.code));
    await tx.user.update({ where: { id: application.userId }, data: { role: 'INSTRUCTOR' } });
    await tx.instructorProfile.upsert({
      where: { userId: application.userId },
      update: { isActive: true, canEditOwnProfile: true },
      create: { userId: application.userId, isActive: true, canEditOwnProfile: true },
    });
    await tx.referralCode.create({ data: { instructorId: application.userId, code } });
    await tx.instructorApplication.update({
      where: { id: application.id },
      data: { status: 'APPROVED', reviewedById: actor.id, reviewedAt: new Date() },
    });
    await queueEmail(tx, {
      userId: application.userId,
      to: application.user.email,
      subject: 'Your Rhyze instructor access is approved',
      template: 'INSTRUCTOR_APPROVED',
      payload: { referralCode: code },
    });
    await queueEmail(tx, {
      userId: application.userId,
      to: application.user.email,
      subject: 'Complete your Rhyze instructor credentials',
      template: 'INSTRUCTOR_DOCUMENTS_MISSING',
      payload: {},
      scheduledFor: new Date(Date.now() + 48 * 60 * 60 * 1000),
    });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: 'instructor.approved', entityType: 'User', entityId: application.userId },
    });
  });
  revalidatePath('/admin/instructors');
}

export async function rejectInstructorAction(formData: FormData) {
  const actor = await requireArea('admin');
  const applicationId = String(formData.get('applicationId') || '');
  const reviewNote = String(formData.get('reviewNote') || '').trim() || null;
  await prisma.instructorApplication.updateMany({
    where: { id: applicationId, status: 'PENDING' },
    data: { status: 'REJECTED', reviewedById: actor.id, reviewedAt: new Date(), reviewNote },
  });
  revalidatePath('/admin/instructors');
}
