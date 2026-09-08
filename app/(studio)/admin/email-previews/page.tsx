import Link from 'next/link';
import { EmailTestSubmitButton } from '@/components/admin/EmailTestSubmitButton';
import { requireApprovedOwner } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { renderTransactionalEmail } from '@/lib/notifications/email-content';
import type { EmailPayload } from '@/lib/notifications/email-templates';
import {
  applyEmailCopyOverride,
  parseEmailCopyOverride,
} from '@/lib/notifications/email-template-overrides';
import {
  EMAIL_TEMPLATE_REVISION,
  emailTemplateCatalog,
  emailTemplateKeys,
  isEmailTemplateKey,
  sampleEmailInput,
} from '@/lib/notifications/email-templates';
import {
  approveEmailTemplateAction,
  saveEmailTemplateCopyAction,
  sendAccountActivationEmailAction,
  sendTestEmailAction,
} from './actions';

const categoryOrder = ['Accounts', 'Bookings', 'Memberships & payments', 'Instructors', 'Messages'] as const;

const errorMessages: Record<string, string> = {
  recipient: 'Enter a valid test email address.',
  configuration: 'Resend sending is not configured for this environment.',
  delivery: 'Resend could not deliver that test. Review the Email archive for the recorded error.',
  template: 'Choose a valid email template.',
  copy: 'Check the subject and required email text, then try saving again.',
  activation: 'That account is not eligible for activation or already has a password.',
};

export default async function AdminEmailPreviewsPage(
  props: {
    searchParams: Promise<{ template?: string; messageId?: string; sent?: string; activationSent?: string; to?: string; approved?: string; saved?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const owner = await requireApprovedOwner();
  const selected = searchParams.template && isEmailTemplateKey(searchParams.template)
    ? searchParams.template
    : emailTemplateKeys[0];
  const reviews = await prisma.emailTemplateReview.findMany({
    where: {
      revision: EMAIL_TEMPLATE_REVISION,
      template: { in: emailTemplateKeys },
    },
  });
  const approved = new Map(reviews.map((review) => [review.template, review]));
  const selectedReview = approved.get(selected);
  const archivedCandidate = searchParams.messageId
    ? await prisma.emailMessage.findFirst({
        where: { id: searchParams.messageId },
        select: { id: true, to: true, toList: true, subject: true, template: true, payload: true, htmlBody: true, createdAt: true },
      })
    : null;
  const archivedSourceTemplate = archivedCandidate?.payload && typeof archivedCandidate.payload === 'object' && !Array.isArray(archivedCandidate.payload)
    ? (archivedCandidate.payload as Record<string, unknown>).sourceTemplate
    : null;
  const archivedMessage = archivedCandidate && (
    archivedCandidate.template === selected || archivedSourceTemplate === selected
  ) ? archivedCandidate : null;
  const definition = emailTemplateCatalog[selected];
  const sample = sampleEmailInput(selected);
  const archivedPayload = archivedMessage?.payload as EmailPayload | undefined;
  const previewInput = archivedPayload
    ? {
        template: selected,
        subject: archivedMessage?.subject || sample.subject,
        payload: archivedPayload,
      }
    : sample;
  const copyOverride = parseEmailCopyOverride(selectedReview?.copyOverride);
  const presentation = applyEmailCopyOverride(
    definition.present(previewInput.payload),
    previewInput.payload,
    copyOverride,
  );
  const rendered = renderTransactionalEmail({ ...previewInput, copyOverride });

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Communications studio</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-6xl tracking-wider">EMAIL PREVIEWS</h1>
          <p className="mt-2 max-w-3xl text-sm font-bold text-rhyze-black/55">
            Review the exact Rhyze design, approve each template, and send yourself an isolated test without releasing queued customer emails.
          </p>
        </div>
        <Link href="/admin/email-archive" className="border border-rhyze-black bg-white px-4 py-3 text-xs font-black uppercase hover:bg-rhyze-black hover:text-white">
          Open email archive →
        </Link>
      </div>

      {(searchParams.sent || searchParams.activationSent || searchParams.approved || searchParams.saved || searchParams.error) && (
        <div className={`mt-6 border-l-4 p-4 text-sm font-bold ${searchParams.error ? 'border-red-600 bg-red-50 text-red-800' : 'border-emerald-600 bg-emerald-50 text-emerald-900'}`}>
          {searchParams.sent && `Test sent to ${searchParams.to || 'your email'}.`}
          {searchParams.activationSent && `Account activation sent to ${searchParams.to || 'the selected account'}.`}
          {searchParams.approved && 'Template approved and recorded.'}
          {searchParams.saved && 'Email text saved and approved.'}
          {searchParams.error && errorMessages[searchParams.error]}
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[310px_minmax(0,1fr)]">
        <aside className="border-t-4 border-rhyze-orange bg-white p-4 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-auto">
          <div className="flex items-center justify-between border-b border-black/10 pb-3">
            <h2 className="font-display text-3xl tracking-wider">ALL TEMPLATES</h2>
            <span className="rounded-full bg-rhyze-black px-2 py-1 text-[10px] font-black text-white">{reviews.length}/{emailTemplateKeys.length}</span>
          </div>
          {categoryOrder.map((category) => (
            <div key={category} className="mt-5">
              <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-rhyze-black/40">{category}</p>
              <div className="grid gap-1.5">
                {emailTemplateKeys.filter((key) => emailTemplateCatalog[key].category === category).map((key) => {
                  const isSelected = key === selected;
                  return (
                    <Link key={key} href={`/admin/email-previews?template=${key}`} className={`flex items-center justify-between gap-3 px-3 py-2.5 text-xs font-black uppercase transition ${isSelected ? 'bg-rhyze-gradient text-rhyze-black' : 'bg-[#fff0e5] hover:bg-rhyze-orange/20'}`}>
                      <span>{emailTemplateCatalog[key].label}</span>
                      <span aria-label={approved.has(key) ? 'Approved' : 'Needs review'} className={`h-2.5 w-2.5 shrink-0 rounded-full ${approved.has(key) ? 'bg-emerald-600' : 'bg-rhyze-coral'}`} />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        <main className="min-w-0">
          <section className="border-t-4 border-rhyze-coral bg-white p-5 md:p-7">
            {archivedMessage && (
              <div className="mb-5 border-l-4 border-emerald-600 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
                Exact archived email preview for {archivedMessage.toList.length ? archivedMessage.toList.join(', ') : archivedMessage.to}. The greeting and details below use this recipient&apos;s saved email data.
              </div>
            )}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rhyze-coral">{definition.category}</p>
                <h2 className="mt-2 font-display text-5xl tracking-wider">{definition.label}</h2>
                <p className="mt-2 max-w-2xl text-sm font-bold text-rhyze-black/55">Sent {definition.trigger.toLowerCase()}.</p>
              </div>
              <span className={`px-3 py-2 text-xs font-black uppercase ${selectedReview ? 'bg-emerald-100 text-emerald-800' : 'bg-[#ffe0d3] text-rhyze-coral'}`}>
                {selectedReview ? '✓ Approved' : 'Needs review'}
              </span>
            </div>
            <div className="mt-6 border border-rhyze-orange/30 bg-[#fff0e5] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rhyze-black/45">Recipient subject line</p>
              <p className="mt-2 text-lg font-black">{rendered.subject}</p>
            </div>
          </section>

          <details
            key={`${selected}:${archivedMessage?.id || 'sample'}`}
            className="mt-6 border-t-4 border-rhyze-orange bg-white p-5 md:p-7"
          >
            <summary className="cursor-pointer list-none">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rhyze-coral">Admin controls</p>
              <h3 className="mt-2 font-display text-4xl tracking-wider">EDIT EMAIL TEXT</h3>
              <p className="mt-2 text-sm font-bold text-rhyze-black/55">Saved changes become the approved version immediately.</p>
            </summary>
            <form action={saveEmailTemplateCopyAction} className="mt-6 grid gap-4 md:grid-cols-2">
              <input type="hidden" name="template" value={selected} />
              {archivedMessage && <input type="hidden" name="messageId" value={archivedMessage.id} />}
              <label className="md:col-span-2 text-[10px] font-black uppercase tracking-[0.16em]">Subject
                <input name="subject" required defaultValue={rendered.subject} className="mt-2 min-h-12 w-full border border-rhyze-orange/40 bg-[#fff0e5] px-3 text-sm normal-case tracking-normal" />
              </label>
              <label className="text-[10px] font-black uppercase tracking-[0.16em]">Small heading
                <input name="eyebrow" required defaultValue={presentation.eyebrow} className="mt-2 min-h-12 w-full border border-rhyze-orange/40 bg-[#fff0e5] px-3 text-sm normal-case tracking-normal" />
              </label>
              <label className="text-[10px] font-black uppercase tracking-[0.16em]">Main headline
                <input name="headline" required defaultValue={presentation.headline} className="mt-2 min-h-12 w-full border border-rhyze-orange/40 bg-[#fff0e5] px-3 text-sm normal-case tracking-normal" />
              </label>
              <label className="md:col-span-2 text-[10px] font-black uppercase tracking-[0.16em]">Greeting
                <input name="greeting" defaultValue={presentation.greeting || ''} className="mt-2 min-h-12 w-full border border-rhyze-orange/40 bg-[#fff0e5] px-3 text-sm normal-case tracking-normal" />
              </label>
              <label className="md:col-span-2 text-[10px] font-black uppercase tracking-[0.16em]">Main message
                <textarea name="paragraphs" required rows={7} defaultValue={presentation.paragraphs.join('\n\n')} className="mt-2 w-full border border-rhyze-orange/40 bg-[#fff0e5] p-3 text-sm font-normal normal-case tracking-normal" />
                <span className="mt-1 block text-[10px] normal-case tracking-normal text-rhyze-black/45">Leave one blank line between paragraphs.</span>
              </label>
              <label className="text-[10px] font-black uppercase tracking-[0.16em]">Callout title
                <input name="calloutTitle" defaultValue={presentation.callout?.title || ''} className="mt-2 min-h-12 w-full border border-rhyze-orange/40 bg-[#fff0e5] px-3 text-sm normal-case tracking-normal" />
              </label>
              <label className="text-[10px] font-black uppercase tracking-[0.16em]">Button text
                <input name="ctaLabel" defaultValue={presentation.cta?.label || ''} className="mt-2 min-h-12 w-full border border-rhyze-orange/40 bg-[#fff0e5] px-3 text-sm normal-case tracking-normal" />
              </label>
              <label className="md:col-span-2 text-[10px] font-black uppercase tracking-[0.16em]">Callout message
                <textarea name="calloutBody" rows={3} defaultValue={presentation.callout?.body || ''} className="mt-2 w-full border border-rhyze-orange/40 bg-[#fff0e5] p-3 text-sm font-normal normal-case tracking-normal" />
              </label>
              <label className="md:col-span-2 text-[10px] font-black uppercase tracking-[0.16em]">Closing line
                <textarea name="closing" rows={2} defaultValue={presentation.closing || ''} className="mt-2 w-full border border-rhyze-orange/40 bg-[#fff0e5] p-3 text-sm font-normal normal-case tracking-normal" />
              </label>
              <div className="md:col-span-2 border border-rhyze-gold/50 bg-[#fff8dc] p-3 text-xs text-rhyze-black/65">
                <strong>Personalization placeholders:</strong>{' '}
                {Object.keys(sample.payload).map((key) => `{{${key}}}`).join(' · ')}
              </div>
              <button className="md:col-span-2 bg-rhyze-black px-4 py-4 text-xs font-black uppercase text-white hover:bg-rhyze-coral">Save &amp; approve changes</button>
            </form>
          </details>

          <section className="mt-6 overflow-hidden border-t-4 border-rhyze-gold bg-[#24272a] p-3 md:p-6">
            <div className="mb-4 flex items-center justify-between text-white">
              <p className="text-xs font-black uppercase tracking-[0.2em]">Recipient preview</p>
              <p className="text-xs text-white/55">Desktop email · responsive on mobile</p>
            </div>
            {archivedMessage?.htmlBody ? (
              <iframe
                title={`${definition.label} exact archived recipient preview`}
                srcDoc={archivedMessage.htmlBody}
                className="h-[860px] w-full border-0 bg-[#24272a]"
              />
            ) : (
              <iframe
                title={`${definition.label} recipient preview`}
                srcDoc={rendered.html}
                className="h-[860px] w-full border-0 bg-[#24272a]"
              />
            )}
          </section>

          <section className="mt-6 grid gap-5 md:grid-cols-2">
            <form action={approveEmailTemplateAction} className="border-t-4 border-emerald-600 bg-white p-5">
              <input type="hidden" name="template" value={selected} />
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Owner review</p>
              <h3 className="mt-2 font-display text-3xl tracking-wider">APPROVE THIS TEMPLATE</h3>
              <p className="mt-2 text-sm text-rhyze-black/55">Records your approval without activating automatic delivery.</p>
              <button className="mt-5 w-full bg-emerald-700 px-4 py-3 text-xs font-black uppercase text-white hover:bg-emerald-800">
                {selectedReview ? 'Approve latest version again' : 'Approve template'}
              </button>
            </form>

            <form action={sendTestEmailAction} className="border-t-4 border-rhyze-orange bg-white p-5">
              <input type="hidden" name="template" value={selected} />
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rhyze-coral">Inbox check</p>
              <h3 className="mt-2 font-display text-3xl tracking-wider">SEND TEST EMAIL</h3>
              <label className="mt-4 block text-[10px] font-black uppercase tracking-[0.16em]">Send preview to</label>
              <input name="email" type="email" required defaultValue={owner.email} className="mt-2 min-h-12 w-full border border-rhyze-orange/40 bg-[#fff0e5] px-3 text-sm" />
              <p className="mt-2 text-xs font-bold text-rhyze-black/50">The button will show “Sending” until Resend confirms the delivery request.</p>
              <EmailTestSubmitButton />
            </form>
          </section>

          {selected === 'ACCOUNT_ACTIVATION' && (
            <form action={sendAccountActivationEmailAction} className="mt-6 border-t-4 border-rhyze-coral bg-white p-5 md:p-7">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rhyze-coral">Real account delivery</p>
              <h3 className="mt-2 font-display text-4xl tracking-wider">SEND ACCOUNT ACTIVATION</h3>
              <p className="mt-2 text-sm font-bold text-rhyze-black/55">
                Sends a working, one-time 30-day activation link to one eligible account. It does not release the remaining Somble member list.
              </p>
              <label className="mt-5 block text-[10px] font-black uppercase tracking-[0.16em]">Existing account email</label>
              <input name="email" type="email" required className="mt-2 min-h-12 w-full border border-rhyze-orange/40 bg-[#fff0e5] px-3 text-sm" />
              <button className="mt-4 w-full bg-rhyze-black px-4 py-4 text-xs font-black uppercase text-white hover:bg-rhyze-coral">
                Send secure activation email
              </button>
            </form>
          )}
        </main>
      </div>
    </>
  );
}
