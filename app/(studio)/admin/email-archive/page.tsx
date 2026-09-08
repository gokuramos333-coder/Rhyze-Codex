import Link from 'next/link';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { isEmailTemplateKey } from '@/lib/notifications/email-templates';

function editableTemplate(message: { template: string | null; payload: unknown }) {
  if (message.template && isEmailTemplateKey(message.template)) return message.template;
  if (!message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) return null;
  const sourceTemplate = (message.payload as Record<string, unknown>).sourceTemplate;
  return typeof sourceTemplate === 'string' && isEmailTemplateKey(sourceTemplate)
    ? sourceTemplate
    : null;
}

function formatDate(value: Date) {
  return value.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default async function AdminEmailArchivePage() {
  await requireApprovedOwner();
  const messages = await prisma.emailMessage.findMany({
    include: { attachments: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
    take: 250,
  });

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Permanent communications record</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-6xl tracking-wider">EMAIL ARCHIVE</h1>
          <p className="mt-2 max-w-3xl text-sm font-bold text-rhyze-black/55">
            Full outgoing and incoming messages are retained in Rhyze&apos;s database, including delivery IDs, threads, and downloaded attachments.
          </p>
        </div>
        <Link href="/admin/integrations" className="border border-rhyze-black px-4 py-3 text-xs font-black uppercase hover:bg-rhyze-black hover:text-white">
          Resend setup →
        </Link>
      </div>

      <section className="mt-8 border-t-4 border-rhyze-orange bg-white p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-4xl tracking-wider">MESSAGES</h2>
          <span className="text-sm font-bold text-rhyze-black/45">Latest {messages.length}</span>
        </div>
        <div className="mt-4 divide-y divide-black/10">
          {messages.map((message) => {
            const template = editableTemplate(message);
            return (
            <details key={message.id} className="group py-4">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-1 text-[10px] font-black uppercase ${message.direction === 'INBOUND' ? 'bg-[#d8eedc] text-emerald-800' : 'bg-[#f7d8c5] text-rhyze-black'}`}>
                        {message.direction}
                      </span>
                      <strong>{message.subject || '(No subject)'}</strong>
                    </div>
                    <p className="mt-2 text-sm text-rhyze-black/55">
                      From {message.from || 'Not recorded'} → {message.toList.length ? message.toList.join(', ') : message.to}
                    </p>
                  </div>
                  <div className="text-right text-xs font-bold text-rhyze-black/45">
                    <p>{formatDate(message.receivedAt || message.sentAt || message.createdAt)}</p>
                    <p className="mt-1 uppercase text-rhyze-coral">{message.status} · Open →</p>
                  </div>
                </div>
              </summary>
              <div className="mt-4 border-l-4 border-rhyze-orange bg-[#fff0e5] p-4 text-sm">
                <dl className="grid gap-2 md:grid-cols-2">
                  <div><dt className="text-xs font-black uppercase text-rhyze-black/45">Resend email ID</dt><dd className="break-all">{message.providerId || 'Pending / not assigned'}</dd></div>
                  <div><dt className="text-xs font-black uppercase text-rhyze-black/45">Conversation thread ID</dt><dd className="break-all">{message.threadId || 'Not assigned'}</dd></div>
                  <div><dt className="text-xs font-black uppercase text-rhyze-black/45">Message ID</dt><dd className="break-all">{message.messageId || 'Not supplied'}</dd></div>
                  <div><dt className="text-xs font-black uppercase text-rhyze-black/45">Linked account</dt><dd>{message.user?.name || message.user?.email || 'No matching account'}</dd></div>
                </dl>
                <div className="mt-5">
                  <p className="text-xs font-black uppercase text-rhyze-black/45">Full message</p>
                  <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap border border-rhyze-orange/30 bg-white p-4 font-sans">{message.textBody || message.htmlBody || 'Body not archived for this older message.'}</pre>
                </div>
                {template && (
                  <Link
                    href={`/admin/email-previews?template=${encodeURIComponent(template)}&messageId=${encodeURIComponent(message.id)}`}
                    className="mt-4 inline-flex bg-rhyze-black px-4 py-3 text-xs font-black uppercase tracking-widest text-white hover:bg-rhyze-coral"
                  >
                    Edit automated template →
                  </Link>
                )}
                {message.attachments.length > 0 && (
                  <div className="mt-5">
                    <p className="text-xs font-black uppercase text-rhyze-black/45">Attachments</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.attachments.map((attachment) => (
                        <Link key={attachment.id} href={`/api/admin/email-attachments/${attachment.id}`} className="border border-rhyze-black bg-white px-3 py-2 text-xs font-black uppercase hover:bg-rhyze-black hover:text-white">
                          Download {attachment.filename} ({Math.max(1, Math.round(attachment.size / 1024))} KB)
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {message.lastError && <p className="mt-4 font-bold text-red-700">Delivery error: {message.lastError}</p>}
              </div>
            </details>
            );
          })}
          {!messages.length && <p className="py-8 text-rhyze-black/45">No archived email yet.</p>}
        </div>
      </section>
    </>
  );
}
