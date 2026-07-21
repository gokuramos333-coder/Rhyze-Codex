import { site } from './site';

const RESEND_SEND_EMAIL_URL = 'https://api.resend.com/emails';
const CONTACT_TO = site.emails.melissa;
const DEFAULT_FROM = 'Rhyze Fitness <onboarding@resend.dev>';

type EmailPayload = {
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
};

type ResendErrorResponse = {
  message?: string;
  name?: string;
};

function getFromEmail() {
  return process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatContactEmail(data: {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}) {
  const subject = `Rhyze contact: ${data.subject}`;
  const text = [
    'New Rhyze Fitness contact submission',
    '',
    `Name: ${data.name}`,
    `Email: ${data.email}`,
    `Phone: ${data.phone || 'Not provided'}`,
    `Subject: ${data.subject}`,
    '',
    data.message,
  ].join('\n');
  const html = `
    <h2>New Rhyze Fitness contact submission</h2>
    <p><strong>Name:</strong> ${escapeHtml(data.name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(data.email)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(data.phone || 'Not provided')}</p>
    <p><strong>Subject:</strong> ${escapeHtml(data.subject)}</p>
    <p><strong>Message:</strong></p>
    <p>${escapeHtml(data.message).replaceAll('\n', '<br />')}</p>
  `;

  return { subject, text, html, replyTo: data.email };
}

export function formatNewsletterEmail(email: string) {
  const subject = 'New Rhyze Fitness subscriber';
  const text = [
    'New Rhyze Fitness newsletter signup',
    '',
    `Email: ${email}`,
  ].join('\n');
  const html = `
    <h2>New Rhyze Fitness newsletter signup</h2>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
  `;

  return { subject, text, html, replyTo: email };
}

export async function sendRhyzeEmail(payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  const res = await fetch(RESEND_SEND_EMAIL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getFromEmail(),
      to: CONTACT_TO,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      reply_to: payload.replyTo,
    }),
  });

  if (!res.ok) {
    let error: ResendErrorResponse | undefined;

    try {
      error = await res.json();
    } catch {
      // Response was not JSON. Status is enough for server logs.
    }

    throw new Error(
      error?.message || `Resend email failed with status ${res.status}`,
    );
  }
}
