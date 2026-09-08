import { describe, expect, it } from 'vitest';
import {
  inboundThreadReference,
  replyAddressForEmail,
  resendStatusForEvent,
} from '@/lib/notifications/email-archive';

describe('durable Resend email archive', () => {
  it('creates a reply address that carries the archived outbound email id', () => {
    expect(replyAddressForEmail('email_123', 'yjenmo.resend.app')).toBe('reply+email_123@yjenmo.resend.app');
    expect(replyAddressForEmail('email_123', '')).toBeNull();
  });

  it('finds the outbound archive id embedded in an inbound recipient', () => {
    expect(inboundThreadReference(['reply+email_123@yjenmo.resend.app'])).toBe('email_123');
    expect(inboundThreadReference(['hello@example.com'])).toBeNull();
  });

  it('maps Resend delivery events to durable local status', () => {
    expect(resendStatusForEvent('email.delivered')).toBe('SENT');
    expect(resendStatusForEvent('email.bounced')).toBe('FAILED');
    expect(resendStatusForEvent('email.received')).toBe('RECEIVED');
    expect(resendStatusForEvent('email.opened')).toBeNull();
  });
});
