'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { classifyManualInstructorInvite } from '@/lib/domain/onboarding/instructor-application';
import { queueInstructorApprovalNotifications } from '@/lib/domain/onboarding/instructor-approval-notifications';

export async function submitInstructorCodeAction(formData: FormData) {
  const user = await requireArea('member');
  const code = String(formData.get('instructorCode') || '');
  const invitation = await prisma.inAppNotification.findUnique({
    where: { dedupeKey: `manual-instructor-invite:${user.id}` },
    select: { id: true, userId: true },
  });
  const decision = classifyManualInstructorInvite({
    hasAdminInvite: invitation?.userId === user.id,
    code,
  });
  if (decision === 'NOT_INVITED') {
    redirect('/member?error=instructor-invite');
  }
  if (decision !== 'PENDING') {
    redirect('/member/instructor-access?error=code');
  }

  const application = await prisma.$transaction(async (tx) => {
    const pending = await tx.instructorApplication.upsert({
      where: { userId: user.id },
      create: { userId: user.id, status: 'PENDING' },
      update: {
        status: 'PENDING',
        reviewedById: null,
        reviewedAt: null,
        reviewNote: null,
      },
    });
    await tx.inAppNotification.updateMany({
      where: {
        userId: user.id,
        dedupeKey: `manual-instructor-invite:${user.id}`,
      },
      data: { readAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'instructor.code_submitted',
        entityType: 'InstructorApplication',
        entityId: pending.id,
      },
    });
    await queueInstructorApprovalNotifications(tx, {
      applicationId: pending.id,
      applicantName: user.name || 'Instructor applicant',
      applicantEmail: user.email,
    });
    return pending;
  });

  revalidatePath('/member');
  revalidatePath('/member/instructor-access');
  revalidatePath('/admin/instructors');
  redirect(`/member/instructor-access?submitted=${encodeURIComponent(application.id)}`);
}
