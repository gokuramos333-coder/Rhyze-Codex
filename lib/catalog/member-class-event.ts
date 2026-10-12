import type { Prisma } from '@prisma/client';

// Owner-approved exception: Rachel is advertised as an event but retains class
// admission/cancellation rules. Never change isEvent to grant access: that flag
// also drives specialty credits, checkout, cancellations and historical reports.
export const MEMBER_CLASS_EVENT_SLUG = 'soul-line-dancing-rachel';

export function isMemberClassEvent(template: { slug?: string; isEvent: boolean }) {
  return !template.isEvent && template.slug === MEMBER_CLASS_EVENT_SLUG;
}

export function isPublicEvent(template: { slug?: string; isEvent: boolean }) {
  return template.isEvent || isMemberClassEvent(template);
}

export function publicEventClassificationWhere() {
  return {
    OR: [
      { isEvent: true },
      { isEvent: false, slug: MEMBER_CLASS_EVENT_SLUG },
    ],
  } satisfies Prisma.ClassTemplateWhereInput;
}

export const MEMBER_CLASS_EVENT_COPY =
  'Use your eligible class credits or VIP unlimited access, or pay for this session. VIP unlimited access does not use your monthly event credit. Regular class cancellation rules apply.';
