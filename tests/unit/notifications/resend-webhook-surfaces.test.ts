import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Resend webhook archive surfaces', () => {
  it('has durable message, attachment, and webhook event storage', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    expect(schema).toContain('enum EmailDirection');
    expect(schema).toContain('model EmailAttachment');
    expect(schema).toMatch(/content\s+Bytes/);
    expect(schema).toContain('model ResendWebhookEvent');
    expect(schema).toContain('threadId');
    expect(schema).toContain('htmlBody');
    expect(schema).toContain('textBody');
  });

  it('verifies raw webhook signatures and retrieves inbound bodies and attachments', () => {
    const route = readFileSync('app/api/resend/webhook/route.ts', 'utf8');
    const processor = readFileSync('lib/notifications/resend-webhook.ts', 'utf8');
    expect(route).toContain('await request.text()');
    expect(route).toContain('resend.webhooks.verify');
    expect(route).toContain("request.headers.get('svix-id')");
    expect(processor).toContain('emails.receiving.get');
    expect(processor).toContain('emails.receiving.attachments.get');
    expect(processor).toContain('arrayBuffer()');
    expect(processor).toContain('resendWebhookEvent');
  });

  it('archives rendered outbound content before sending', () => {
    const worker = readFileSync('app/api/jobs/email/route.ts', 'utf8');
    expect(worker).toContain('textBody: content.text');
    expect(worker).toContain('htmlBody: content.html');
    expect(worker).toContain('replyAddressForEmail');
    expect(worker).toContain('attachments: true');
  });

  it('provides a protected permanent archive for management', () => {
    const page = readFileSync('app/(studio)/admin/email-archive/page.tsx', 'utf8');
    const download = readFileSync('app/api/admin/email-attachments/[attachmentId]/route.ts', 'utf8');
    expect(page).toContain('EMAIL ARCHIVE');
    expect(page).toContain('providerId');
    expect(download).toContain('requireApprovedOwner');
    expect(download).toContain("'content-disposition'");
  });
});
