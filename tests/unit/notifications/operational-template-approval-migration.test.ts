import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMAIL_TEMPLATE_REVISION } from '@/lib/notifications/email-templates';

const migrationPath =
  'netlify/database/migrations/20260826180000_operational_email_template_approvals.sql';

describe('operational email template approval migration', () => {
  it('archives already-stale notices before approving only the three blocked operational templates', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    const cancellation = sql.indexOf('UPDATE "EmailMessage"');
    const approval = sql.indexOf('INSERT INTO "EmailTemplateReview"');

    expect(cancellation).toBeGreaterThanOrEqual(0);
    expect(approval).toBeGreaterThan(cancellation);
    expect(sql).toContain("'PASSWORD_CHANGED'");
    expect(sql).toContain("'ATTENDANCE_NO_SHOW'");
    expect(sql).toContain("'ADMIN_BOOKING_CANCELLED'");
    expect(sql).toContain(`'${EMAIL_TEMPLATE_REVISION}'`);
    expect(sql).toContain('"status" = \'CANCELLED\'');
    expect(sql).toContain('email.operational-templates-approved');
    expect(sql).not.toContain("'CLASS_REMINDER'");
  });
});
