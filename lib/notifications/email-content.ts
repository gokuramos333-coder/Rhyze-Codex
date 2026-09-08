import {
  emailTemplateCatalog,
  isEmailTemplateKey,
  type EmailPayload,
  type EmailPresentation,
} from '@/lib/notifications/email-templates';
import {
  applyEmailCopyOverride,
  applyEmailSubjectOverride,
  parseEmailCopyOverride,
} from '@/lib/notifications/email-template-overrides';

function escapeHtml(input: string) {
  return input.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
  })[character]!);
}

function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001').replace(/\/$/, '');
  return `${appUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function fallbackPresentation(subject: string, payload: EmailPayload): EmailPresentation {
  const message = Object.entries(payload)
    .filter(([key, item]) => !/id$/i.test(key) && typeof item === 'string' && item.trim())
    .map(([, item]) => String(item))[0];
  return {
    eyebrow: 'A note from Rhyze',
    headline: subject,
    paragraphs: [message || 'Open My Rhyze for the latest details.'],
    cta: { label: 'Open My Rhyze', href: '/member' },
  };
}

function renderText(subject: string, presentation: EmailPresentation) {
  return [
    subject,
    '',
    presentation.greeting,
    ...presentation.paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(presentation.facts || []).map((fact) => `${fact.label}: ${fact.value}`),
    presentation.facts?.length ? '' : undefined,
    presentation.callout ? `${presentation.callout.title}\n${presentation.callout.body}` : undefined,
    presentation.callout ? '' : undefined,
    presentation.cta ? `${presentation.cta.label}: ${absoluteUrl(presentation.cta.href)}` : undefined,
    '',
    presentation.closing,
    'In Rhythm, We Rise.',
    'Rhyze Fitness',
    'The Shoppes at Lafayette',
    '75 NJ-15, Lafayette Township, NJ 07848',
    'Building J',
  ].filter((line): line is string => typeof line === 'string').join('\n');
}

function renderHtml(subject: string, presentation: EmailPresentation) {
  const paragraphs = presentation.paragraphs.map((paragraph) => `<p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#24211d">${escapeHtml(paragraph)}</p>`).join('');
  const facts = presentation.facts?.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0;border:1px solid #d7cdbd;border-radius:2px;background:#fffaf2">${presentation.facts.map((fact) => `<tr><td style="padding:13px 18px;border-bottom:1px solid #eadfce;font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#9b5f20;width:32%">${escapeHtml(fact.label)}</td><td style="padding:13px 18px;border-bottom:1px solid #eadfce;font-size:15px;font-weight:700;color:#171717">${escapeHtml(fact.value)}</td></tr>`).join('')}</table>` : '';
  const callout = presentation.callout ? `<div style="margin:30px 0;padding:22px;border:1px solid #171717;background:#fffaf2"><p style="margin:0 0 8px;font-size:17px;font-weight:800;color:#171717">${escapeHtml(presentation.callout.title)}</p><p style="margin:0;font-size:14px;line-height:1.65;color:#4f4941">${escapeHtml(presentation.callout.body)}</p></div>` : '';
  const cta = presentation.cta ? `<p style="margin:30px 0"><a href="${escapeHtml(absoluteUrl(presentation.cta.href))}" style="display:inline-block;background:#171717;color:#ffffff;padding:15px 24px;border-radius:3px;text-decoration:none;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase">${escapeHtml(presentation.cta.label)}</a></p>` : '';

  const logoUrl = absoluteUrl('/brand/rhyze-logo-header.png');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:0;background:#24272a;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#24272a"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#f4f0df"><tr><td style="height:6px;background:#ff5c45;background-image:linear-gradient(90deg,#ff5c45,#f7a928)"></td></tr><tr><td style="padding:28px 36px 18px"><img src="${escapeHtml(logoUrl)}" alt="Rhyze Fitness" width="118" style="display:block;width:118px;height:auto;border:0"><p style="margin:8px 0 0;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#a26a27">In Rhythm, We Rise.</p></td></tr><tr><td style="padding:12px 36px 42px"><p style="margin:0 0 12px;font-size:11px;font-weight:900;letter-spacing:2.4px;text-transform:uppercase;color:#ff5c45">${escapeHtml(presentation.eyebrow)}</p><h1 style="margin:0 0 28px;font-family:Georgia,'Times New Roman',serif;font-size:42px;line-height:1.05;font-weight:400;color:#171717">${escapeHtml(presentation.headline)}</h1>${presentation.greeting ? `<p style="margin:0 0 18px;font-size:16px;font-weight:700;color:#24211d">${escapeHtml(presentation.greeting)}</p>` : ''}${paragraphs}${facts}${callout}${cta}${presentation.closing ? `<p style="margin:28px 0 0;font-size:14px;line-height:1.6;color:#4f4941">${escapeHtml(presentation.closing)}</p>` : ''}</td></tr><tr><td style="padding:26px 36px;background:#171717;color:#f4f0df"><p style="margin:0;font-size:13px;line-height:1.6"><strong style="color:#f7a928">In Rhythm, We Rise.</strong><br>Rhyze Fitness</p><p style="margin:14px 0 0;font-size:11px;line-height:1.7;color:#bcb5a9">The Shoppes at Lafayette<br>75 NJ-15, Lafayette Township, NJ 07848<br>Building J<br><br>Questions? Reply to this email and our management team will help.</p></td></tr></table></td></tr></table></body></html>`;
}

export function renderTransactionalEmail(input: {
  subject: string;
  template: string;
  payload: EmailPayload;
  copyOverride?: unknown;
}) {
  const basePresentation = isEmailTemplateKey(input.template)
    ? emailTemplateCatalog[input.template].present(input.payload)
    : fallbackPresentation(input.subject, input.payload);
  const copyOverride = parseEmailCopyOverride(input.copyOverride);
  const subject = applyEmailSubjectOverride(input.subject, input.payload, copyOverride);
  const presentation = applyEmailCopyOverride(basePresentation, input.payload, copyOverride);
  return {
    subject,
    text: renderText(subject, presentation),
    html: renderHtml(subject, presentation),
  };
}
