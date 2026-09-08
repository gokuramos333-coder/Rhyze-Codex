import { requireArea } from '@/lib/auth/session';
import { UnsendMessageForm } from '@/components/messages/UnsendMessageForm';
import { prisma } from '@/lib/db/prisma';
import { messageReadReceipt, messageSenderLabel } from '@/lib/domain/messages/member-conversation';
import { replyToManagementAction, unsendMemberMessageAction } from './actions';
import { ResetAfterSubmitForm } from '@/components/messages/ResetAfterSubmitForm';

const dateTime = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/New_York',
});

export default async function MemberMessagesPage(
  props: {
    searchParams: Promise<{ sent?: string; unsent?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await requireArea('member');
  const conversation = await prisma.memberConversation.findUnique({
    where: { memberId: user.id },
    include: {
      messages: {
        include: { sender: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (conversation) {
    await prisma.$transaction([
      prisma.memberConversationMessage.updateMany({
        where: {
          conversationId: conversation.id,
          senderId: { not: user.id },
          memberReadAt: null,
        },
        data: { memberReadAt: new Date() },
      }),
      prisma.inAppNotification.updateMany({
        where: { userId: user.id, link: '/member/messages', readAt: null },
        data: { readAt: new Date() },
      }),
    ]);
  }

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Direct support</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">MESSAGES</h1>
      <p className="mt-3 max-w-2xl text-rhyze-black/55">Your private conversation with Rhyze management. Replies stay together here.</p>

      {searchParams.sent && <p className="mt-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 text-sm font-bold">Your reply was sent to management.</p>}
      {searchParams.unsent && <p className="mt-6 border-l-4 border-rhyze-orange bg-orange-50 p-4 text-sm font-bold">Your message was unsent.</p>}
      {searchParams.error && <p className="mt-6 border-l-4 border-rhyze-coral bg-red-50 p-4 text-sm font-bold">We could not send that reply. Please check the message and try again.</p>}

      {conversation ? (
        <>
          <section className="mt-8 grid gap-4" aria-label="Conversation messages">
            {conversation.messages.map((message) => {
              const sender = messageSenderLabel({
                senderId: message.senderId,
                memberId: user.id,
                senderName: message.sender.name,
              });
              const mine = message.senderId === user.id;
              const receipt = messageReadReceipt(message.managementReadAt);
              return (
                <article key={message.id} className={`max-w-3xl border-l-4 p-5 ${mine ? 'ml-8 md:ml-14 border-rhyze-gold bg-orange-50' : 'border-rhyze-coral bg-white'}`}>
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
                  {mine && !message.deletedAt && (
                    <p className={`mt-3 text-right text-xs font-bold ${receipt.status === 'READ' ? 'text-blue-600' : 'text-rhyze-black/45'}`}>
                      {receipt.status === 'READ' ? (
                        <>✓✓ Read <time dateTime={receipt.readAt.toISOString()}>{dateTime.format(receipt.readAt)}</time></>
                      ) : '✓ Sent'}
                    </p>
                  )}
                  {mine && !message.deletedAt && (
                    <UnsendMessageForm action={unsendMemberMessageAction} fields={{ messageId: message.id }} />
                  )}
                </article>
              );
            })}
          </section>
          <ResetAfterSubmitForm action={replyToManagementAction} className="mt-8 border-t-4 border-rhyze-orange bg-white p-6">
            <label className="grid gap-2 text-xs font-black uppercase tracking-widest">
              Reply to management
              <textarea name="body" required maxLength={2000} rows={5} className="border border-rhyze-orange/30 bg-orange-50 p-4 text-base font-normal normal-case tracking-normal" />
            </label>
            <button className="mt-4 bg-rhyze-gradient px-6 py-4 text-xs font-black uppercase tracking-widest">Send reply</button>
          </ResetAfterSubmitForm>
        </>
      ) : (
        <section className="mt-8 border-l-4 border-rhyze-orange bg-white p-8">
          <h2 className="font-display text-3xl tracking-wider">NO MESSAGES YET</h2>
          <p className="mt-2 text-rhyze-black/55">When management sends you a direct message, the complete conversation will appear here.</p>
        </section>
      )}
    </>
  );
}
