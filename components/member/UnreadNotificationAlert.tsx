'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BellRing, X } from 'lucide-react';

type Notification = {
  id: string;
  title: string;
  body: string;
  link: string | null;
};

export function UnreadNotificationAlert({
  notification,
}: {
  notification: Notification;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-rhyze-black/70 p-5">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unread-message-title"
        className="w-full max-w-lg border-t-4 border-rhyze-coral bg-orange-50 p-6 text-rhyze-black shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-rhyze-orange/20 text-rhyze-coral">
              <BellRing className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-rhyze-coral">
                New Rhyze message
              </p>
              <h2 id="unread-message-title" className="mt-1 text-xl font-black">
                {notification.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close new message alert"
            className="focus-ring p-2 text-rhyze-black/55 hover:text-rhyze-black"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="mt-5 leading-7 text-rhyze-black/70">{notification.body}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={notification.link || '/member/notifications'}
            className="bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase tracking-widest"
          >
            View message
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="border border-rhyze-black px-5 py-3 text-xs font-black uppercase tracking-widest"
          >
            Not now
          </button>
        </div>
      </section>
    </div>
  );
}
