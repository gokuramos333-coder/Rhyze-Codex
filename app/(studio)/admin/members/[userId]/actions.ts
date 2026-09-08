'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireApprovedOwner, requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { queueEmail } from '@/lib/notifications/email-queue';
import { deleteObject, putPublicImage } from '@/lib/storage/object-storage';
import { getStripe } from '@/lib/payments/stripe';
import { stripeIsConfigured } from '@/lib/payments/stripe';
import {
  returnedCreditTerms,
  returnedCreditTransactionKey,
} from '@/lib/domain/credits/returned-credit';
import {
  membershipAdminTransition,
  type MembershipAdminAction,
} from '@/lib/domain/memberships/admin-membership-action';
import { validateMembershipFreeze } from '@/lib/domain/memberships/freeze-policy';
import { STUDIO_TIME_ZONE } from '@/lib/config/studio';
import {
  manualCreditAccountCanBeDeleted,
  manualCreditLabel,
} from '@/lib/domain/credits/manual-credit';

const messageSchema = z.object({
  userId: z.string().min(1),
  subject: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(2_000),
});

const transactionActionSchema = z.object({
  userId: z.string().min(1),
  sourceId: z.string().min(1),
  sourceType: z.enum(['RHYZE', 'SOMBLE']),
});

const manualCreditGrantSchema = z.object({
  userId: z.string().min(1),
  creditKind: z.enum(['CLASS', 'EVENT']),
  quantity: z.coerce.number().int().min(1).max(100),
  expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(3).max(240),
});

const manualCreditUpdateSchema = manualCreditGrantSchema.extend({
  creditAccountId: z.string().min(1),
});

const manualCreditDeleteSchema = z.object({
  userId: z.string().min(1),
  creditAccountId: z.string().min(1),
});

function newYorkBoundary(year: number, month: number, day: number) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 5, 0, 0, 0));
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STUDIO_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(utcGuess);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  const second = Number(parts.find((part) => part.type === 'second')?.value);
  return new Date(utcGuess.getTime() - ((hour * 60 + minute) * 60 + second) * 1_000);
}

function manualCreditValidUntil(expirationDate: string) {
  const [year, month, day] = expirationDate.split('-').map(Number);
  return newYorkBoundary(year, month, day + 1);
}

function redirectManualCreditError(userId: string): never {
  redirect(`/admin/members/${userId}?error=manual-credit#credits`);
}

export async function updateAdminMemberProfilePhotoAction(formData: FormData) {
  const actor = await requireArea('admin');
  const userId = String(formData.get('userId') || '');
  const photo = formData.get('photo');
  if (!userId || !(photo instanceof File) || !photo.size) {
    redirect(`/admin/members/${userId}?error=photo#profile-photo`);
  }

  let photoUrl: string;
  try {
    photoUrl = await putPublicImage(photo);
  } catch {
    redirect(`/admin/members/${userId}?error=photo#profile-photo`);
  }

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, image: true, memberProfile: { select: { photoUrl: true } } },
  });
  if (!current) redirect(`/admin/members/${userId}?error=photo#profile-photo`);

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { image: photoUrl } }),
    prisma.memberProfile.upsert({
      where: { userId },
      update: { photoUrl },
      create: { userId, photoUrl },
    }),
    prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'admin.member-profile-photo.updated',
        entityType: 'User',
        entityId: userId,
        before: { photoUrl: current.memberProfile?.photoUrl || current.image || null },
        after: { photoUrl },
      },
    }),
  ]);

  for (const oldUrl of new Set([current.memberProfile?.photoUrl, current.image])) {
    if (oldUrl?.startsWith('/api/media/') && oldUrl !== photoUrl) {
      await deleteObject(oldUrl);
    }
  }

  revalidatePath(`/admin/members/${userId}`);
  revalidatePath('/member/profile');
  revalidatePath('/member');
  redirect(`/admin/members/${userId}?sent=photo#profile-photo`);
}

export async function grantManualMemberCreditsAction(formData: FormData) {
  const actor = await requireArea('admin');
  const parsed = manualCreditGrantSchema.safeParse({
    userId: formData.get('userId'),
    creditKind: formData.get('creditKind'),
    quantity: formData.get('quantity'),
    expirationDate: formData.get('expirationDate'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) redirectManualCreditError(String(formData.get('userId') || ''));

  const { userId, creditKind, quantity, expirationDate, reason } = parsed.data;
  const member = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  const validFrom = new Date();
  const validUntil = manualCreditValidUntil(expirationDate);
  if (!member || validUntil <= validFrom) redirectManualCreditError(userId);

  await prisma.$transaction(async (tx) => {
    const account = await tx.creditAccount.create({
      data: {
        userId,
        label: manualCreditLabel(creditKind, expirationDate),
        validFrom,
        validUntil,
      },
    });
    await tx.creditLedgerEntry.create({
      data: {
        creditAccountId: account.id,
        type: 'GRANT',
        quantity,
        reason: `Manual admin credit grant: ${reason}`,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'credit.manual-grant',
        entityType: 'User',
        entityId: userId,
        after: {
          creditAccountId: account.id,
          creditKind,
          quantity,
          validFrom: validFrom.toISOString(),
          validUntil: validUntil.toISOString(),
          expirationDate,
          reason,
        },
      },
    });
  });

  revalidatePath(`/admin/members/${userId}`);
  revalidatePath('/member');
  revalidatePath('/member/membership');
  redirect(`/admin/members/${userId}?sent=manual-credit#credits`);
}

export async function updateManualMemberCreditsAction(formData: FormData) {
  const actor = await requireArea('admin');
  const parsed = manualCreditUpdateSchema.safeParse({
    userId: formData.get('userId'),
    creditAccountId: formData.get('creditAccountId'),
    creditKind: formData.get('creditKind'),
    quantity: formData.get('quantity'),
    expirationDate: formData.get('expirationDate'),
    reason: formData.get('reason'),
  });
  if (!parsed.success) redirectManualCreditError(String(formData.get('userId') || ''));

  const { userId, creditAccountId, creditKind, quantity, expirationDate, reason } = parsed.data;
  const validUntil = manualCreditValidUntil(expirationDate);
  const changedAt = new Date();
  if (validUntil <= changedAt) redirectManualCreditError(userId);

  const account = await prisma.creditAccount.findFirst({
    where: { id: creditAccountId, userId },
    include: { entries: { orderBy: { createdAt: 'asc' } } },
  });
  if (!account || account.isUnlimited) redirectManualCreditError(userId);
  const isManualGrant = account.entries.some(
    (entry) => entry.type === 'GRANT' && entry.reason?.startsWith('Manual admin credit grant:'),
  );
  if (!isManualGrant) redirectManualCreditError(userId);

  const currentBalance = account.entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const adjustment = quantity - currentBalance;
  await prisma.$transaction(async (tx) => {
    await tx.creditAccount.update({
      where: { id: creditAccountId },
      data: {
        label: manualCreditLabel(creditKind, expirationDate),
        validUntil,
      },
    });
    if (adjustment !== 0) {
      await tx.creditLedgerEntry.create({
        data: {
          creditAccountId,
          type: 'ADJUSTMENT',
          quantity: adjustment,
          reason: `Manual admin credit update: ${reason}`,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'credit.manual-update',
        entityType: 'CreditAccount',
        entityId: creditAccountId,
        before: {
          userId,
          quantity: currentBalance,
          validUntil: account.validUntil?.toISOString() || null,
          label: account.label,
        },
        after: {
          userId,
          creditKind,
          quantity,
          adjustment,
          validUntil: validUntil.toISOString(),
          expirationDate,
          reason,
        },
      },
    });
  });

  revalidatePath(`/admin/members/${userId}`);
  revalidatePath('/member');
  revalidatePath('/member/membership');
  redirect(`/admin/members/${userId}?sent=manual-credit-updated#credits`);
}

export async function deleteManualMemberCreditsAction(formData: FormData) {
  const actor = await requireArea('admin');
  const parsed = manualCreditDeleteSchema.safeParse({
    userId: formData.get('userId'),
    creditAccountId: formData.get('creditAccountId'),
  });
  const fallbackUserId = String(formData.get('userId') || '');
  if (!parsed.success) {
    redirect(`/admin/members/${fallbackUserId}?error=manual-credit-delete#credits`);
  }

  const { userId, creditAccountId } = parsed.data;
  let deleted = false;
  try {
    deleted = await prisma.$transaction(async (tx) => {
      const account = await tx.creditAccount.findFirst({
        where: { id: creditAccountId, userId },
        include: { entries: { orderBy: { createdAt: 'asc' } } },
      });
      if (!account || !manualCreditAccountCanBeDeleted(account)) return false;

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'credit.manual-delete',
          entityType: 'CreditAccount',
          entityId: creditAccountId,
          before: {
            userId,
            label: account.label,
            validFrom: account.validFrom.toISOString(),
            validUntil: account.validUntil?.toISOString() || null,
            entries: account.entries.map((entry) => ({
              id: entry.id,
              type: entry.type,
              quantity: entry.quantity,
              reason: entry.reason,
            })),
          },
          after: { deleted: true },
        },
      });
      await tx.creditLedgerEntry.deleteMany({
        where: { creditAccountId },
      });
      await tx.creditAccount.delete({ where: { id: creditAccountId } });
      return true;
    });
  } catch {
    deleted = false;
  }

  if (!deleted) {
    redirect(`/admin/members/${userId}?error=manual-credit-delete#credits`);
  }
  revalidatePath(`/admin/members/${userId}`);
  revalidatePath('/member');
  revalidatePath('/member/membership');
  redirect(`/admin/members/${userId}?sent=manual-credit-deleted#credits`);
}

export async function returnTransactionCreditAction(formData: FormData) {
  const actor = await requireApprovedOwner();
  const parsed = transactionActionSchema.safeParse({
    userId: formData.get('userId'),
    sourceId: formData.get('sourceId'),
    sourceType: formData.get('sourceType'),
  });
  if (!parsed.success) redirect('/admin/members?error=credit-return');

  const { userId, sourceId, sourceType } = parsed.data;
  let label: string | null = null;
  if (sourceType === 'RHYZE') {
    const purchase = await prisma.purchase.findFirst({
      where: { id: sourceId, userId },
      select: { id: true, product: { select: { name: true } } },
    });
    label = purchase?.product.name || null;
  } else {
    const transaction = await prisma.sombleTransaction.findFirst({
      where: { id: sourceId, userId },
      select: { id: true, contentType: true },
    });
    label = transaction?.contentType || null;
  }
  if (!label) redirect(`/admin/members/${userId}?error=credit-return`);

  const sourceReturnKey = returnedCreditTransactionKey(sourceType, sourceId);
  const existing = await prisma.creditLedgerEntry.findUnique({
    where: { sourceReturnKey },
    select: { id: true },
  });
  if (existing) redirect(`/admin/members/${userId}?sent=credit-already-returned`);

  const returnedAt = new Date();
  const terms = returnedCreditTerms(returnedAt);
  await prisma.$transaction(async (tx) => {
    const account = await tx.creditAccount.create({
      data: {
        userId,
        label: `Returned credit — ${label}`,
        validFrom: terms.validFrom,
        validUntil: terms.validUntil,
      },
    });
    await tx.creditLedgerEntry.create({
      data: {
        creditAccountId: account.id,
        sourceReturnKey,
        type: 'RESTORE',
        quantity: terms.quantity,
        reason: `Admin returned credit from ${sourceType.toLowerCase()} transaction`,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'credit.returned',
        entityType: sourceType === 'RHYZE' ? 'Purchase' : 'SombleTransaction',
        entityId: sourceId,
        after: { userId, quantity: 1, validUntil: terms.validUntil.toISOString() },
      },
    });
  });
  revalidatePath(`/admin/members/${userId}`);
  revalidatePath('/member');
  revalidatePath('/member/membership');
  redirect(`/admin/members/${userId}?sent=credit-returned`);
}

export async function refundMemberPurchaseAction(formData: FormData) {
  const actor = await requireApprovedOwner();
  const userId = String(formData.get('userId') || '');
  const purchaseId = String(formData.get('purchaseId') || '');
  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, userId, status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } },
    include: { user: true, product: true, membership: true, creditAccount: { include: { entries: true } } },
  });
  const refundableAmount = purchase
    ? purchase.amountCents - purchase.refundedAmountCents
    : 0;
  if (!purchase?.stripePaymentIntentId || refundableAmount <= 0 || !stripeIsConfigured()) {
    redirect(`/admin/members/${userId}?error=refund`);
  }

  try {
    const refund = await getStripe().refunds.create(
      { payment_intent: purchase.stripePaymentIntentId, amount: refundableAmount },
      { idempotencyKey: `admin-member-refund-${purchase.id}-${purchase.refundedAmountCents}` },
    );
    if (purchase.membership?.stripeSubscriptionId) {
      await getStripe().subscriptions.cancel(
        purchase.membership.stripeSubscriptionId,
        { prorate: false },
        { idempotencyKey: `admin-member-refund-cancel-${purchase.id}` },
      );
    }
    await prisma.$transaction(async (tx) => {
      await tx.refund.create({
        data: {
          purchaseId: purchase.id,
          amountCents: refundableAmount,
          stripeRefundId: refund.id,
          reason: 'Admin full refund from client profile',
        },
      });
      await tx.purchase.update({
        where: { id: purchase.id },
        data: { status: 'REFUNDED', refundedAmountCents: purchase.amountCents },
      });
      await tx.paymentRecord.updateMany({
        where: { purchaseId: purchase.id },
        data: { status: 'REFUNDED', refundedAmountCents: purchase.amountCents },
      });
      await tx.membership.updateMany({
        where: { purchaseId: purchase.id },
        data: { status: 'CANCELLED', cancelAtPeriodEnd: false, currentPeriodEnd: new Date() },
      });
      await tx.creditAccount.updateMany({
        where: { sourcePurchaseId: purchase.id },
        data: { validUntil: new Date() },
      });
      await tx.referralCommission.updateMany({
        where: { purchaseId: purchase.id },
        data: { status: 'REVERSED', reversedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'purchase.refunded',
          entityType: 'Purchase',
          entityId: purchase.id,
          after: { amountCents: refundableAmount, stripeRefundId: refund.id },
        },
      });
      await queueEmail(tx, {
        userId: purchase.userId,
        to: purchase.user.email,
        subject: 'Your Rhyze refund was issued',
        template: 'PAYMENT_REFUND_CONFIRMATION',
        payload: {
          name: purchase.user.name || 'Rhyzer',
          itemName: purchase.product.name,
          amount: refundableAmount,
          billingUrl: '/member/billing',
        },
        dedupeKey: `refund-confirmation:${refund.id}`,
      });
    });
  } catch {
    redirect(`/admin/members/${userId}?error=refund`);
  }

  revalidatePath(`/admin/members/${userId}`);
  revalidatePath('/admin/activity');
  revalidatePath('/admin');
  revalidatePath('/admin/payments');
  revalidatePath('/member');
  revalidatePath('/member/membership');
  redirect(`/admin/members/${userId}?sent=refund`);
}

export async function sendMemberMessageAction(formData: FormData) {
  const actor = await requireApprovedOwner();
  const parsed = messageSchema.safeParse({
    userId: formData.get('userId'),
    subject: formData.get('subject'),
    body: formData.get('body'),
  });
  if (!parsed.success) redirect(`/admin/members/${String(formData.get('userId') || '')}?error=message`);

  const member = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, email: true },
  });
  if (!member) redirect('/admin/members');

  await prisma.$transaction(async (tx) => {
    const conversation = await tx.memberConversation.upsert({
      where: { memberId: member.id },
      update: { subject: parsed.data.subject },
      create: { memberId: member.id, subject: parsed.data.subject },
    });
    const message = await tx.memberConversationMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: actor.id,
        subject: parsed.data.subject,
        body: parsed.data.body,
        managementReadAt: new Date(),
      },
    });
    const notification = await tx.inAppNotification.create({
      data: {
        userId: member.id,
        title: parsed.data.subject,
        body: parsed.data.body,
        link: '/member/messages',
      },
    });
    await queueEmail(tx, {
      userId: member.id,
      to: member.email,
      subject: parsed.data.subject,
      template: 'ADMIN_MESSAGE',
      payload: {
        body: parsed.data.body,
        senderName: actor.name || 'Rhyze Management',
        messageUrl: '/member/messages',
        notificationId: notification.id,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'member.message.sent',
        entityType: 'User',
        entityId: member.id,
        after: { notificationId: notification.id, conversationId: conversation.id, messageId: message.id },
      },
    });
  });

  revalidatePath(`/admin/members/${member.id}`);
  redirect(`/admin/members/${member.id}?sent=message`);
}

export async function updateMemberMembershipAction(formData: FormData) {
  const actor = await requireApprovedOwner();
  const membershipId = String(formData.get('membershipId') || '');
  const userId = String(formData.get('userId') || '');
  const action = String(formData.get('membershipAction') || '') as MembershipAdminAction;
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, userId },
    include: { product: true, user: true },
  });
  if (!membership) redirect(`/admin/members/${userId}?error=membership-action`);

  let transition: ReturnType<typeof membershipAdminTransition>;
  try {
    transition = membershipAdminTransition(action, membership.status);
    if (membership.stripeSubscriptionId) {
      await getStripe().subscriptions.update(
        membership.stripeSubscriptionId,
        transition.stripeUpdate,
        { idempotencyKey: `admin-membership-${membership.id}-${action}-${membership.updatedAt.getTime()}` },
      );
    }
  } catch {
    redirect(`/admin/members/${userId}?error=membership-action`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { id: membership.id },
      data: {
        status: transition.localStatus,
        cancelAtPeriodEnd: transition.cancelAtPeriodEnd,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: `membership.${action.toLowerCase()}`,
        entityType: 'Membership',
        entityId: membership.id,
        before: { status: membership.status, cancelAtPeriodEnd: membership.cancelAtPeriodEnd },
        after: { status: transition.localStatus, cancelAtPeriodEnd: transition.cancelAtPeriodEnd },
      },
    });
    const template = action === 'PAUSE' ? 'MEMBERSHIP_PAUSED'
      : action === 'UNPAUSE' ? 'MEMBERSHIP_RESUMED'
        : 'MEMBERSHIP_CANCELLED';
    const accessEndsAt = membership.currentPeriodEnd?.toLocaleDateString('en-US', {
      timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric',
    }) || 'the end of your paid billing period';
    await queueEmail(tx, {
      userId: membership.userId,
      to: membership.user.email,
      subject: action === 'PAUSE' ? 'Your Rhyze membership is paused'
        : action === 'UNPAUSE' ? 'Your Rhyze membership is active again'
          : 'Your Rhyze membership cancellation is confirmed',
      template: action === 'PAUSE' ? 'MEMBERSHIP_PAUSED'
        : action === 'UNPAUSE' ? 'MEMBERSHIP_RESUMED'
          : 'MEMBERSHIP_CANCELLED',
      payload: {
        name: membership.user.name || 'Rhyzer',
        planName: membership.product.name,
        accessEndsAt,
        billingUrl: '/member/billing',
        membershipUrl: '/member/membership',
      },
      dedupeKey: `membership-status:${membership.id}:${template}:${membership.updatedAt.getTime()}`,
    });
  });
  revalidatePath(`/admin/members/${userId}`);
  revalidatePath('/member');
  revalidatePath('/member/membership');
  redirect(`/admin/members/${userId}?sent=membership-action`);
}

export async function scheduleMembershipFreezeAction(formData: FormData) {
  const actor = await requireApprovedOwner();
  const membershipId = String(formData.get('membershipId') || '');
  const userId = String(formData.get('userId') || '');
  const startDate = String(formData.get('startDate') || '');
  const resumeDate = String(formData.get('resumeDate') || '');
  const startAt = new Date(`${startDate}T12:00:00.000Z`);
  const endAt = new Date(`${resumeDate}T12:00:00.000Z`);
  if (!membershipId || !userId || !startDate || !resumeDate || Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    redirect(`/admin/members/${userId}?error=freeze`);
  }

  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, userId, status: { in: ['ACTIVE', 'TRIALING', 'PAUSED'] } },
    include: {
      user: true,
      product: true,
      freezes: { where: { cancelledAt: null }, orderBy: { startAt: 'asc' } },
    },
  });
  if (!membership) redirect(`/admin/members/${userId}?error=freeze`);
  const validation = validateMembershipFreeze({
    startAt,
    endAt,
    existing: membership.freezes.map((freeze) => ({ startAt: freeze.startAt, endAt: freeze.endAt })),
  });
  if (!validation.valid) redirect(`/admin/members/${userId}?error=freeze-policy`);

  const today = new Date().toISOString().slice(0, 10);
  const activateNow = startDate <= today;
  try {
    if (activateNow && membership.stripeSubscriptionId) {
      if (!stripeIsConfigured()) throw new Error('Stripe is not configured');
      await getStripe().subscriptions.update(
        membership.stripeSubscriptionId,
        { pause_collection: { behavior: 'void' } },
        { idempotencyKey: `membership-freeze-${membership.id}-${startDate}` },
      );
    }
    await prisma.$transaction(async (tx) => {
      const freeze = await tx.membershipFreeze.create({
        data: {
          membershipId,
          createdById: actor.id,
          startAt,
          endAt,
          activatedAt: activateNow ? new Date() : null,
        },
      });
      if (activateNow) {
        await tx.membership.update({ where: { id: membershipId }, data: { status: 'PAUSED' } });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'membership.freeze-scheduled',
          entityType: 'MembershipFreeze',
          entityId: freeze.id,
          after: { startAt, endAt, totalDaysInYear: validation.totalDays },
        },
      });
      await queueEmail(tx, {
        userId,
        to: membership.user.email,
        subject: 'Your Rhyze membership freeze is scheduled',
        template: 'MEMBERSHIP_PAUSED',
        payload: {
          name: membership.user.name || 'Rhyzer',
          planName: membership.product.name,
          pauseUntil: endAt.toLocaleDateString('en-US', { timeZone: 'America/New_York', dateStyle: 'long' }),
          billingUrl: '/member/billing',
        },
        dedupeKey: `membership-freeze:${membership.id}:${startDate}:${resumeDate}`,
      });
    });
  } catch {
    redirect(`/admin/members/${userId}?error=freeze`);
  }
  revalidatePath(`/admin/members/${userId}`);
  revalidatePath('/member');
  revalidatePath('/member/membership');
  redirect(`/admin/members/${userId}?sent=freeze`);
}

export async function reviewMembershipChangeRequestAction(formData: FormData) {
  const actor = await requireApprovedOwner();
  const requestId = String(formData.get('requestId') || '');
  const userId = String(formData.get('userId') || '');
  const decision = String(formData.get('decision') || '');
  const reviewNote = String(formData.get('reviewNote') || '').trim().slice(0, 1000) || null;
  const request = await prisma.membershipChangeRequest.findFirst({
    where: { id: requestId, userId, status: 'PENDING' },
    include: { membership: { include: { user: true, product: true } }, requestedProduct: true },
  });
  if (!request || !['APPROVE', 'DENY'].includes(decision)) {
    redirect(`/admin/members/${userId}?error=request-review`);
  }
  if (decision === 'APPROVE' && request.type !== 'CANCEL') {
    redirect(`/admin/members/${userId}?error=change-policy`);
  }

  if (decision === 'APPROVE') {
    try {
      const transition = membershipAdminTransition('CANCEL_AT_PERIOD_END', request.membership.status);
      if (request.membership.stripeSubscriptionId) {
        await getStripe().subscriptions.update(
          request.membership.stripeSubscriptionId,
          transition.stripeUpdate,
          { idempotencyKey: `approve-cancel-${request.id}` },
        );
      }
      await prisma.$transaction(async (tx) => {
        await tx.membership.update({
          where: { id: request.membershipId },
          data: { cancelAtPeriodEnd: true },
        });
        await tx.membershipChangeRequest.update({
          where: { id: request.id },
          data: { status: 'APPROVED', reviewedById: actor.id, reviewedAt: new Date(), reviewNote },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: 'membership.change-request-approved',
            entityType: 'MembershipChangeRequest',
            entityId: request.id,
            after: { type: request.type, cancelAtPeriodEnd: true },
          },
        });
        await queueEmail(tx, {
          userId,
          to: request.membership.user.email,
          subject: 'Your Rhyze membership cancellation is confirmed',
          template: 'MEMBERSHIP_CANCELLED',
          payload: {
            name: request.membership.user.name || 'Rhyzer',
            planName: request.membership.product.name,
            accessEndsAt: request.membership.currentPeriodEnd?.toLocaleDateString('en-US', {
              timeZone: 'America/New_York', month: 'long', day: 'numeric', year: 'numeric',
            }) || 'the end of your paid billing period',
            membershipUrl: '/member/membership',
          },
          dedupeKey: `membership-cancellation-approved:${request.id}`,
        });
      });
    } catch {
      redirect(`/admin/members/${userId}?error=request-review`);
    }
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.membershipChangeRequest.update({
        where: { id: request.id },
        data: { status: 'DENIED', reviewedById: actor.id, reviewedAt: new Date(), reviewNote },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'membership.change-request-denied',
          entityType: 'MembershipChangeRequest',
          entityId: request.id,
          after: { type: request.type },
        },
      });
      await queueEmail(tx, {
        userId,
        to: request.membership.user.email,
        subject: 'Your membership request was reviewed',
        template: 'MEMBERSHIP_CHANGE_REQUEST_REVIEWED',
        payload: {
          name: request.membership.user.name || 'Rhyzer',
          requestType: request.type.toLowerCase(),
          decision: 'not approved',
          reviewNote: reviewNote || 'Please contact management if you would like us to review another option.',
          membershipUrl: '/member/membership',
        },
        dedupeKey: `membership-change-request-reviewed:${request.id}`,
      });
    });
  }

  await prisma.inAppNotification.create({
    data: {
      userId,
      title: decision === 'APPROVE' ? 'Membership cancellation scheduled' : 'Membership request reviewed',
      body: decision === 'APPROVE'
        ? 'Your membership will remain available through the current paid billing period and then cancel.'
        : `Admin reviewed your ${request.type.toLowerCase()} request.${reviewNote ? ` ${reviewNote}` : ''}`,
      link: '/member/membership',
    },
  });
  revalidatePath(`/admin/members/${userId}`);
  revalidatePath('/member/membership');
  redirect(`/admin/members/${userId}?sent=request-review`);
}
