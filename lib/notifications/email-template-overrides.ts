import { z } from 'zod';
import type { EmailPayload, EmailPresentation } from '@/lib/notifications/email-templates';

const optionalCopy = z.string().max(2_000).optional();

export const copyOverrideSchema = z.object({
  subject: z.string().trim().min(2).max(160).optional(),
  eyebrow: z.string().trim().min(1).max(100).optional(),
  headline: z.string().trim().min(2).max(180).optional(),
  greeting: optionalCopy,
  paragraphs: z.array(z.string().trim().min(1).max(2_000)).min(1).max(8).optional(),
  calloutTitle: optionalCopy,
  calloutBody: optionalCopy,
  ctaLabel: z.string().trim().max(100).optional(),
  closing: optionalCopy,
});

export type EmailCopyOverride = z.infer<typeof copyOverrideSchema>;

export function parseEmailCopyOverride(value: unknown): EmailCopyOverride | undefined {
  const parsed = copyOverrideSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function replaceSampleValuesWithPlaceholders(value: string, payload: EmailPayload) {
  return Object.entries(payload)
    .filter(([, sample]) => (typeof sample === 'string' || typeof sample === 'number') && String(sample).length > 1)
    .sort(([, left], [, right]) => String(right).length - String(left).length)
    .reduce((copy, [key, sample]) => {
      const escaped = String(sample).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return copy.replace(new RegExp(escaped, 'g'), `{{${key}}}`);
    }, value);
}

function interpolate(value: string, payload: EmailPayload) {
  return value.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (placeholder, key: string) => {
    const replacement = payload[key];
    return typeof replacement === 'string' || typeof replacement === 'number'
      ? String(replacement)
      : placeholder;
  });
}

function optionalInterpolated(value: string | undefined, payload: EmailPayload) {
  if (value === undefined) return undefined;
  const interpolated = interpolate(value, payload).trim();
  return interpolated || undefined;
}

export function applyEmailSubjectOverride(
  subject: string,
  payload: EmailPayload,
  override?: EmailCopyOverride,
) {
  return override?.subject ? interpolate(override.subject, payload) : subject;
}

export function applyEmailCopyOverride(
  presentation: EmailPresentation,
  payload: EmailPayload,
  override?: EmailCopyOverride,
): EmailPresentation {
  if (!override) return presentation;
  const calloutTitle = optionalInterpolated(override.calloutTitle, payload);
  const calloutBody = optionalInterpolated(override.calloutBody, payload);
  return {
    ...presentation,
    eyebrow: override.eyebrow ? interpolate(override.eyebrow, payload) : presentation.eyebrow,
    headline: override.headline ? interpolate(override.headline, payload) : presentation.headline,
    greeting: override.greeting !== undefined
      ? optionalInterpolated(override.greeting, payload)
      : presentation.greeting,
    paragraphs: override.paragraphs
      ? override.paragraphs.map((paragraph) => interpolate(paragraph, payload))
      : presentation.paragraphs,
    callout: override.calloutTitle !== undefined || override.calloutBody !== undefined
      ? calloutTitle && calloutBody ? { title: calloutTitle, body: calloutBody } : undefined
      : presentation.callout,
    cta: presentation.cta && override.ctaLabel !== undefined
      ? { ...presentation.cta, label: interpolate(override.ctaLabel, payload) }
      : presentation.cta,
    closing: override.closing !== undefined
      ? optionalInterpolated(override.closing, payload)
      : presentation.closing,
  };
}
