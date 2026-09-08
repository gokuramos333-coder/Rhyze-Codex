'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { approvedOwnerEmails } from '@/lib/auth/owner-access';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { canUnsendMessage } from '@/lib/domain/messages/member-conversation';
import { queueEmail } from '@/lib/notifications/email-queue';

const replySchema = z.object({
  body: z.string().trim().min(1).max(2_000),
});

const unsendSchema = z.object({ messageId: z.string().min(1) });

export async function unsendMemberMessageAction(formData: FormData) {
  const member = await requireArea('member');
  const parsed = unsendSchema.safeParse({ messageId: formData.get('messageId') });
  if (!parsed.success) redirect('/member/messages?error=unsend');

  const message = await prisma.memberConversationMessage.findUnique({
    where: { id: parsed.data.messageId },
    include: { conversation: { select: { id: true, memberId: true } } },
  });
  if (
    !message ||
    message.conversation.memberId !== member.id ||
    !canUnsendMessage({ actorId: member.id, senderId: message.senderId, deletedAt: message.deletedAt })
  ) redirect('/member/messages?error=unsend');

  await prisma.$transaction([
    prisma.memberConversationMessage.update({
      where: { id: message.id },
      data: { body: '', subject: null, deletedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        actorId: member.id,
        action: 'member.conversation.message.unsent',
        entityType: 'MemberConversationMessage',
        entityId: message.id,
        after: { conversationId: message.conversation.id },
      },
    }),
  ]);

  revalidatePath('/member/messages');
  revalidatePath(`/admin/messages/${message.conversation.id}`);
  redirect('/member/messages?unsent=message');
}

export async function replyToManagementAction(formData: FormData) {
  const member = await requireArea('member');
  const parsed = replySchema.safeParse({ body: formData.get('body') });
  if (!parsed.success) redirect('/member/messages?error=reply');

  const ownerEmails = approvedOwnerEmails().filter((email) => email !== member.email.toLowerCase());
  const [conversation, owners] = await Promise.all([
    prisma.memberConversation.findUnique({ where: { memberId: member.id } }),
    prisma.user.findMany({
      where: {
        email: { in: ownerEmails },
        role: 'OWNER',
        status: 'ACTIVE',
      },
      select: { id: true, email: true },
    }),
  ]);
  if (!conversation) redirect('/member/messages?error=conversation');

  await prisma.$transaction(async (tx) => {
    const message = await tx.memberConversationMessage.create({
      data: {
        conversationId: conversation.id,
        senderId: member.id,
        body: parsed.data.body,
        memberReadAt: new Date(),
      },
    });
    await tx.memberConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    for (const email of ownerEmails) {
      const owner = owners.find((candidate) => candidate.email.toLowerCase() === email);
      if (owner) {
        await tx.inAppNotification.create({
          data: {
            userId: owner.id,
            title: `Reply from ${member.name || member.email}`,
            body: parsed.data.body,
            link: `/admin/messages/${conversation.id}`,
            dedupeKey: `member-reply-notification:${message.id}:${owner.id}`,
          },
        });
      }
      await queueEmail(tx, {
        userId: owner?.id,
        to: email,
        subject: `Member reply: ${conversation.subject}`,
        template: 'MEMBER_REPLY',
        payload: {
          body: parsed.data.body,
          senderName: member.name || member.email,
          messageUrl: `/admin/messages/${conversation.id}`,
        },
        dedupeKey: `member-reply-email:${message.id}:${email}`,
      });
    }
    await tx.auditLog.create({
      data: {
        actorId: member.id,
        action: 'management.conversation.replied',
        entityType: 'MemberConversation',
        entityId: conversation.id,
        after: { messageId: message.id, notifiedOwnerCount: ownerEmails.length },
      },
    });
  });

  revalidatePath('/member/messages');
  revalidatePath('/admin/messages');
  redirect('/member/messages?sent=reply');
}
