import type { EmailStatus } from '@prisma/client';

const replyReferencePattern = /^reply\+([a-zA-Z0-9_-]+)@/;

export function replyAddressForEmail(emailId: string, inboundDomain: string) {
  const domain = inboundDomain.trim().toLowerCase();
  return domain ? `reply+${emailId}@${domain}` : null;
}

export function inboundThreadReference(recipients: string[]) {
  for (const recipient of recipients) {
    const match = recipient.trim().match(replyReferencePattern);
    if (match) return match[1];
  }
  return null;
}

export function resendStatusForEvent(eventType: string): EmailStatus | null {
  if (eventType === 'email.received') return 'RECEIVED';
  if (eventType === 'email.bounced' || eventType === 'email.failed' || eventType === 'email.suppressed') return 'FAILED';
  if (eventType === 'email.sent' || eventType === 'email.delivered') return 'SENT';
  return null;
}
