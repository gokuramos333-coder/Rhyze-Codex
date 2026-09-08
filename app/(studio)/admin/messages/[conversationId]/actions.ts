'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { queueEmail } from '@/lib/notifications/email-queue';
import { canUnsendMessage } from '@/lib/domain/messages/member-conversation';

const replySchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().trim().min(1).max(2_000),
});

const unsendSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
});

export async function unsendAdminMessageAction(formData: FormData) {
  const actor = await requireApprovedOwner();
  const parsed = unsendSchema.safeParse({
    conversationId: formData.get('conversationId'),
    messageId: formData.get('messageId'),
  });
  if (!parsed.success) redirect('/admin/messages?error=unsend');

  const message = await prisma.memberConversationMessage.findUnique({
    where: { id: parsed.data.messageId },
    select: { id: true, conversationId: true, senderId: true, deletedAt: true },
  });
  if (
    !message ||
    message.conversationId !== parsed.data.conversationId ||
    !canUnsendMessage({ actorId: actor.id, senderId: message.senderId, deletedAt: message.deletedAt })
  ) redirect(`/admin/messages/${parsed.data.conversationId}?error=unsend`);

  await prisma.$transaction([
    prisma.memberConversationMessage.update({
      where: { id: message.id },
      data: { body: '', subject: null, deletedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'admin.conversation.message.unsent',
        entityType: 'MemberConversationMessage',
        entityId: message.id,
        after: { conversationId: message.conversationId },
      },
    }),
  ]);

  revalidatePath('/admin/messages');
  revalidatePath(`/admin/messages/${message.conversationId}`);
  revalidatePath('/member/messages');
  redirect(`/admin/messages/${message.conversationId}?unsent=message`);
}

export async function replyToMemberAction(formData: FormData) {
  const actor = await requireApprovedOwner();
  const parsed = replySchema.safeParse({
    conversationId: formData.get('conversationId'),
    body: formData.get('body'),
  });
  if (!parsed.success) redirect('/admin/messages?error=reply');

  const conversation = await prisma.memberConversation.findUnique({
    where: { id: parsed.data.conversationId },
    include: { member: { select: { id: true, email: true } } },
  });
  if (!conversation) redirect('/admin/messages');

  await prisma.$transaction(async (tx) => {
    const message = await tx.memberConversationMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: actor.id,
        body: parsed.data.body,
        managementReadAt: new Date(),
      },
    });
    await tx.memberConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
    const notification = await tx.inAppNotification.create({
      data: {
        userId: conversation.member.id,
        title: conversation.subject,
        body: parsed.data.body,
        link: '/member/messages',
      },
    });
    await queueEmail(tx, {
      userId: conversation.member.id,
      to: conversation.member.email,
      subject: `New Rhyze message: ${conversation.subject}`,
      template: 'ADMIN_MESSAGE',
      payload: {
        body: parsed.data.body,
        senderName: actor.name || 'Rhyze Management',
        messageUrl: '/member/messages',
      },
      dedupeKey: `conversation-message-email:${message.id}`,
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'member.conversation.replied',
        entityType: 'MemberConversation',
        entityId: conversation.id,
        after: { messageId: message.id, notificationId: notification.id },
      },
    });
  });

  revalidatePath('/admin/messages');
  revalidatePath(`/admin/messages/${conversation.id}`);
  revalidatePath('/member/messages');
  redirect(`/admin/messages/${conversation.id}?sent=reply`);
}
