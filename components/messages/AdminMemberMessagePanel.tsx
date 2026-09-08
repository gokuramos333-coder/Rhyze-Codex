'use client';

import { useRef } from 'react';

type Message = {
  id: string;
  sender: string;
  body: string;
  createdAt: string;
  deleted: boolean;
};

export function AdminMemberMessagePanel({
  action,
  userId,
  memberName,
  messages,
}: {
  action: (formData: FormData) => void | Promise<void>;
  userId: string;
  memberName: string;
  messages: Message[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <section className="mt-6 border-t-4 border-rhyze-coral bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-3xl tracking-wider">MESSAGE {memberName}</h2>
        <button type="button" onClick={() => dialogRef.current?.showModal()} className="border border-rhyze-black px-4 py-2 text-[10px] font-black uppercase">View messages</button>
      </div>
      <form
        ref={formRef}
        action={action}
        onSubmit={() => window.setTimeout(() => formRef.current?.reset(), 0)}
        className="mt-4 grid gap-4 md:grid-cols-[1fr_2fr_auto] md:items-end"
      >
        <input type="hidden" name="userId" value={userId} />
        <label className="grid gap-2 text-xs font-black uppercase tracking-widest">
          Message subject
          <input name="subject" required maxLength={120} className="min-h-12 border border-black/15 px-3 text-sm font-normal normal-case tracking-normal" />
        </label>
        <label className="grid gap-2 text-xs font-black uppercase tracking-widest">
          Message
          <textarea name="body" required maxLength={2000} rows={3} className="border border-black/15 p-3 text-sm font-normal normal-case tracking-normal" />
        </label>
        <button className="min-h-12 bg-rhyze-gradient px-5 text-xs font-black uppercase tracking-widest">Send alert</button>
      </form>

      <dialog ref={dialogRef} className="w-[min(44rem,calc(100%-2rem))] border-t-4 border-rhyze-orange bg-[#eee9dd] p-0 text-rhyze-black shadow-2xl backdrop:bg-black/70">
        <div className="flex items-center justify-between bg-rhyze-black p-5 text-white">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-rhyze-orange">Conversation</p><h3 className="font-display text-3xl tracking-wider">{memberName}</h3></div>
          <button type="button" onClick={() => dialogRef.current?.close()} className="border border-white/30 px-3 py-2 text-xs font-black uppercase">Close</button>
        </div>
        <div className="max-h-[65vh] space-y-3 overflow-y-auto p-5">
          {messages.map((message) => (
            <article key={message.id} className="border-l-4 border-rhyze-coral bg-white p-4">
              <div className="flex flex-wrap justify-between gap-2 text-xs font-bold"><span>{message.sender}</span><time>{message.createdAt}</time></div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{message.deleted ? 'This message was unsent.' : message.body}</p>
            </article>
          ))}
          {!messages.length && <p className="bg-white p-5 text-sm font-bold text-rhyze-black/50">No messages yet.</p>}
        </div>
      </dialog>
    </section>
  );
}
