import Link from 'next/link';
import { notFound } from 'next/navigation';
import { UnsendMessageForm } from '@/components/messages/UnsendMessageForm';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { messageReadReceipt, messageSenderLabel } from '@/lib/domain/messages/member-conversation';
import { replyToMemberAction, unsendAdminMessageAction } from './actions';
import { ResetAfterSubmitForm } from '@/components/messages/ResetAfterSubmitForm';

const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/New_York',
});

export default async function AdminConversationPage(
  props: {
    params: Promise<{ conversationId: string }>;
    searchParams: Promise<{ sent?: string; unsent?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const actor = await requireApprovedOwner();
  const conversation = await prisma.memberConversation.findUnique({
    where: { id: params.conversationId },
    include: {
      member: { select: { id: true, name: true, email: true } },
      messages: {
        include: { sender: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!conversation) notFound();

  await prisma.$transaction([
    prisma.memberConversationMessage.updateMany({
      where: {
        conversationId: conversation.id,
        senderId: conversation.memberId,
        managementReadAt: null,
      },
      data: { managementReadAt: new Date() },
    }),
    prisma.inAppNotification.updateMany({
      where: {
        userId: actor.id,
        link: `/admin/messages/${conversation.id}`,
        readAt: null,
      },
      data: { readAt: new Date() },
    }),
  ]);

  return (
    <>
      <Link href="/admin/messages" className="text-xs font-black uppercase tracking-widest text-rhyze-coral">
        ← All messages
      </Link>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Member conversation</p>
          <h1 className="mt-2 font-display text-5xl tracking-wider">{conversation.member.name || conversation.member.email}</h1>
          <p className="mt-1 text-sm text-rhyze-black/55">{conversation.subject} · {conversation.member.email}</p>
        </div>
        <Link href={`/admin/members/${conversation.member.id}`} className="border border-rhyze-black px-4 py-3 text-xs font-black uppercase">
          Open member profile
        </Link>
      </div>

      {searchParams.sent && <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 text-sm font-bold">Reply sent to the member.</p>}
      {searchParams.unsent && <p className="mt-6 border-l-4 border-rhyze-orange bg-orange-50 p-4 text-sm font-bold">Your message was unsent.</p>}
      {searchParams.error && <p className="mt-6 border-l-4 border-rhyze-coral bg-red-50 p-4 text-sm font-bold">That message could not be unsent.</p>}

      <section className="mt-8 grid gap-4" aria-label="Conversation messages">
        {conversation.messages.map((message) => {
          const sender = messageSenderLabel({
            senderId: message.senderId,
            memberId: conversation.memberId,
            senderName: message.sender.name,
          });
          const fromMember = message.senderId === conversation.memberId;
          const receipt = messageReadReceipt(message.memberReadAt);
          return (
            <article key={message.id} className={`max-w-3xl border-l-4 p-5 ${fromMember ? 'border-rhyze-coral bg-white' : 'ml-8 md:ml-14 border-rhyze-gold bg-orange-50'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <strong>{message.sender.name || message.sender.email}</strong>
                <time dateTime={message.createdAt.toISOString()} className="text-xs font-bold text-rhyze-black/45">
                  {dateTime.format(message.createdAt)}
                </time>
              </div>
              <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-rhyze-coral">{sender.kind}</p>
              {message.deletedAt ? (
                <p className="mt-3 italic text-rhyze-black/45">This message was unsent.</p>
              ) : (
                <>
                  {message.subject && <p className="mt-3 font-black">{message.subject}</p>}
                  <p className="mt-2 whitespace-pre-wrap leading-7 text-rhyze-black/75">{message.body}</p>
                </>
              )}
              {!fromMember && !message.deletedAt && (
                <p className={`mt-3 text-right text-xs font-bold ${receipt.status === 'READ' ? 'text-blue-600' : 'text-rhyze-black/45'}`}>
                  {receipt.status === 'READ' ? (
                    <>✓✓ Read <time dateTime={receipt.readAt.toISOString()}>{dateTime.format(receipt.readAt)}</time></>
                  ) : '✓ Sent'}
                </p>
              )}
              {message.senderId === actor.id && !message.deletedAt && (
                <UnsendMessageForm
                  action={unsendAdminMessageAction}
                  fields={{ conversationId: conversation.id, messageId: message.id }}
                />
              )}
            </article>
          );
        })}
      </section>

      <ResetAfterSubmitForm action={replyToMemberAction} className="mt-8 border-t-4 border-rhyze-orange bg-white p-6">
        <input type="hidden" name="conversationId" value={conversation.id} />
        <p className="mb-4 text-xs font-black uppercase tracking-widest text-rhyze-coral">
          Replying as {actor.name || actor.email}
        </p>
        <label className="grid gap-2 text-xs font-black uppercase tracking-widest">
          Reply to {conversation.member.name || 'member'}
          <textarea name="body" required maxLength={2000} rows={5} className="border border-rhyze-orange/30 bg-orange-50 p-4 text-base font-normal normal-case tracking-normal" />
        </label>
        <button className="mt-4 bg-rhyze-gradient px-6 py-4 text-xs font-black uppercase tracking-widest">Send reply</button>
      </ResetAfterSubmitForm>
    </>
  );
}
