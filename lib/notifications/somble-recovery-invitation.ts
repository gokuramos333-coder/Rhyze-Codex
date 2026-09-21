import { Prisma } from '@prisma/client';
import {
  eligibleRecovery,
  RECOVERY_SUBJECT,
  RECOVERY_TEMPLATE,
  recoveryPurchaseId,
} from '@/lib/domain/memberships/somble-billing-recovery';
import { EMAIL_TEMPLATE_REVISION } from '@/lib/notifications/email-templates';
import { queueEmail } from '@/lib/notifications/email-queue';

export async function queueSombleRecoveryInvitation(
  tx: Prisma.TransactionClient,
  input: { userId: string; actor: { id: string; email: string }; now?: Date },
) {
  const user = await tx.user.findUnique({
    where: { id: input.userId },
    include: { memberships: { include: { product: true } } },
  });
  const r = user && eligibleRecovery(user, user.memberships, input.now);
  if (!r)
    throw new Error(
      'This member is not eligible for the reviewed recovery invitation.',
    );
  // Only the explicit owner action approves this exact reviewed copy. No global delivery bypass.
  const approval = {
    revision: EMAIL_TEMPLATE_REVISION,
    approvedAt: input.now ?? new Date(),
    approvedById: input.actor.id,
    approvedByEmail: input.actor.email,
    copyOverride: Prisma.DbNull,
  };
  await tx.emailTemplateReview.upsert({
    where: { template: RECOVERY_TEMPLATE },
    update: approval,
    create: { template: RECOVERY_TEMPLATE, ...approval },
  });
  const message = await queueEmail(tx, {
    userId: r.userId,
    to: r.email,
    subject: RECOVERY_SUBJECT,
    template: RECOVERY_TEMPLATE,
    payload: {
      firstName: r.firstName,
      amount: `$${r.amountCents / 100}`,
      day: String(r.day),
      ordinal: r.day === 3 ? '3rd' : '4th',
      planName: r.name,
      benefits:
        r.kind === 'VIP'
          ? 'Your VIP benefits remain connected.'
          : 'Your eight-class monthly allowance remains connected.',
      recoveryUrl: `/member/membership?recovery=${r.membershipId}`,
    },
    dedupeKey: `${recoveryPurchaseId(r)}:invitation`,
  });
  await tx.auditLog.create({
    data: {
      actorId: input.actor.id,
      action: 'somble-recovery.invitation-queued',
      entityType: 'Membership',
      entityId: r.membershipId,
      after: {
        emailMessageId: message.id,
        template: RECOVERY_TEMPLATE,
        revision: EMAIL_TEMPLATE_REVISION,
        amountCents: r.amountCents,
      },
    },
  });
  return message;
}
