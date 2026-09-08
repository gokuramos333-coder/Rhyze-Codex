import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('owner email template review center', () => {
  it('stores owner approval for each template', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    expect(schema).toContain('model EmailTemplateReview');
    expect(schema).toMatch(/template\s+String\s+@unique/);
    expect(schema).toMatch(/revision\s+String/);
    expect(schema).toMatch(/copyOverride\s+Json\?/);
    expect(schema).toContain('approvedByEmail');
  });

  it('provides an owner-only full preview gallery', () => {
    const page = readFileSync('app/(studio)/admin/email-previews/page.tsx', 'utf8');
    expect(page).toContain('requireApprovedOwner');
    expect(page).toContain('emailTemplateKeys');
    expect(page).toContain('srcDoc={rendered.html}');
    expect(page).toContain('APPROVE THIS TEMPLATE');
    expect(page).toContain('SEND TEST EMAIL');
    expect(page).toContain('EDIT EMAIL TEXT');
    expect(page).toContain('saveEmailTemplateCopyAction');
    expect(page).toContain('messageId?: string');
    expect(page).toContain('archivedMessage?.payload');
    expect(page).toContain('Exact archived email preview');
    expect(page).toContain("key={`${selected}:${archivedMessage?.id || 'sample'}`}");
  });

  it('links archived automated emails back to their exact template preview', () => {
    const archive = readFileSync('app/(studio)/admin/email-archive/page.tsx', 'utf8');
    expect(archive).toContain('isEmailTemplateKey');
    expect(archive).toContain('/admin/email-previews?template=');
    expect(archive).toContain('messageId=');
    expect(archive).toContain('Edit automated template');
  });

  it('protects, validates, archives, and isolates test sends', () => {
    const actions = readFileSync('app/(studio)/admin/email-previews/actions.ts', 'utf8');
    const page = readFileSync('app/(studio)/admin/email-previews/page.tsx', 'utf8');
    expect(actions).toContain('requireApprovedOwner');
    expect(actions).toContain('z.string().email()');
    expect(actions).toContain('isEmailTemplateKey');
    expect(actions).toContain('renderTransactionalEmail');
    expect(actions).toContain("template: `TEST_${template}`");
    expect(actions).toContain("replyTo: ['melissa@rhyzefit.com']");
    expect(actions).toContain('emailTemplateReview.upsert');
    expect(actions).not.toContain('EMAIL_DELIVERY_ENABLED');
    expect(actions).toContain('copyOverrideSchema');
    expect(actions).toContain('saveEmailTemplateCopyAction');
    expect(actions).toContain('copyOverride:');
    expect(actions).toContain('sendAccountActivationEmailAction');
    expect(actions).toContain('issueAccountClaim');
    expect(actions).toContain("action: 'account.activation.sent'");
    expect(page).toContain('SEND ACCOUNT ACTIVATION');
    expect(page).toContain('It does not release the remaining Somble member list.');
  });

  it('links the preview center from Admin navigation', () => {
    const layout = readFileSync('app/(studio)/admin/layout.tsx', 'utf8');
    expect(layout).toContain("href: '/admin/email-previews', label: 'Email previews'");
  });

  it('holds automatic delivery until the current template revision is approved', () => {
    const worker = readFileSync('app/api/jobs/email/route.ts', 'utf8');
    expect(worker).toContain('EMAIL_TEMPLATE_REVISION');
    expect(worker).toContain('emailTemplateReview.findMany');
    expect(worker).toContain('approvedTemplates.has(message.template)');
    expect(worker).toContain('copyOverride: review ? review.copyOverride : undefined');
  });

  it('does not let the direct contact flow bypass owner approval', () => {
    const contact = readFileSync('app/api/contact/route.ts', 'utf8');
    expect(contact).toContain('EMAIL_TEMPLATE_REVISION');
    expect(contact).toContain("template: { in: ['CONTACT_FORM', 'CONTACT_CONFIRMATION'] }");
    expect(contact).toContain("error: 'email_templates_pending_approval'");
  });

  it('backfills every current email template as approved', () => {
    const migration = readFileSync('prisma/migrations/20260727193000_email_template_editing/migration.sql', 'utf8');
    expect(migration).toContain('ADD COLUMN "copyOverride" JSONB');
    expect(migration).toContain("'WELCOME'");
    expect(migration).toContain("'CONTACT_CONFIRMATION'");
    expect(migration).toContain('melissa@rhyzefit.com');
  });
});
