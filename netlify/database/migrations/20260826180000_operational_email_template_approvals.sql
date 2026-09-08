DO $$
DECLARE
  archived_message_count INTEGER := 0;
  approved_template_count INTEGER := 0;
BEGIN
  WITH archived AS (
    UPDATE "EmailMessage"
    SET
      "status" = 'CANCELLED',
      "lastError" = 'Archived before operational template approval so a stale notice is not delivered.',
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "direction" = 'OUTBOUND'
      AND "status" = 'QUEUED'
      AND "template" IN (
        'PASSWORD_CHANGED',
        'ATTENDANCE_NO_SHOW',
        'ADMIN_BOOKING_CANCELLED'
      )
    RETURNING "id"
  )
  SELECT COUNT(*) INTO archived_message_count FROM archived;

  INSERT INTO "EmailTemplateReview" (
    "id", "template", "revision", "approvedAt", "approvedById",
    "approvedByEmail", "createdAt", "updatedAt"
  )
  SELECT
    'email-operational-' || lower(approved."template"),
    approved."template",
    '2026-07-27-v3',
    CURRENT_TIMESTAMP,
    'SYSTEM',
    'melissa@rhyzefit.com',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM (VALUES
    ('PASSWORD_CHANGED'),
    ('ATTENDANCE_NO_SHOW'),
    ('ADMIN_BOOKING_CANCELLED')
  ) AS approved("template")
  ON CONFLICT ("template") DO UPDATE SET
    "revision" = EXCLUDED."revision",
    "approvedAt" = EXCLUDED."approvedAt",
    "approvedById" = EXCLUDED."approvedById",
    "approvedByEmail" = EXCLUDED."approvedByEmail",
    "updatedAt" = EXCLUDED."updatedAt";

  GET DIAGNOSTICS approved_template_count = ROW_COUNT;

  INSERT INTO "AuditLog" (
    "id", "actorId", "action", "entityType", "entityId", "after", "createdAt"
  ) VALUES (
    'rhyze-operational-email-template-approvals-20260826',
    NULL,
    'email.operational-templates-approved',
    'EmailTemplateReview',
    NULL,
    jsonb_build_object(
      'revision', '2026-07-27-v3',
      'templates', jsonb_build_array(
        'PASSWORD_CHANGED',
        'ATTENDANCE_NO_SHOW',
        'ADMIN_BOOKING_CANCELLED'
      ),
      'approvedTemplates', approved_template_count,
      'archivedQueuedMessages', archived_message_count,
      'reason', 'Approve current operational templates without delivering notices queued before approval.'
    ),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("id") DO NOTHING;
END $$;
