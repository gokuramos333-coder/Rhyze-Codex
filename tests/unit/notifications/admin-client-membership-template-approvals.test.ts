import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMAIL_TEMPLATE_REVISION } from '@/lib/notifications/email-templates';

describe('admin client and membership email approvals', () => {
  it('approves both user-requested transactional templates at the active revision', () => {
    const sql = readFileSync(
      'netlify/database/migrations/20260908150000_admin_client_membership_email_approvals.sql',
      'utf8',
    );
    expect(sql).toContain("'ADMIN_CLIENT_INVITATION'");
    expect(sql).toContain("'ADMIN_MEMBERSHIP_ASSIGNED'");
    expect(sql).toContain(`'${EMAIL_TEMPLATE_REVISION}'`);
    expect(sql).toContain('email.admin-client-membership-templates-approved');
  });

  it('ships the commerce refund table migration through Netlify DB deployment', () => {
    const sql = readFileSync(
      'netlify/database/migrations/20260908143000_add_commerce_refunds.sql',
      'utf8',
    );
    expect(sql).toContain('CREATE TABLE "CommerceRefund"');
    expect(sql).toContain('INSERT INTO "CommerceRefund"');
  });
});
