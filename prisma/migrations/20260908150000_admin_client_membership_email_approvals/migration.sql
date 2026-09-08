DO $$
DECLARE
  approved_template_count INTEGER := 0;
BEGIN
  INSERT INTO "EmailTemplateReview" (
    "id", "template", "revision", "approvedAt", "approvedById",
    "approvedByEmail", "createdAt", "updatedAt"
  )
  SELECT
    'email-admin-client-membership-' || lower(approved."template"),
    approved."template",
    '2026-07-27-v3',
    CURRENT_TIMESTAMP,
    'SYSTEM',
    'melissa@rhyzefit.com',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM (VALUES
    ('ADMIN_CLIENT_INVITATION'),
    ('ADMIN_MEMBERSHIP_ASSIGNED')
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
    'rhyze-admin-client-membership-email-approvals-20260908',
    NULL,
    'email.admin-client-membership-templates-approved',
    'EmailTemplateReview',
    NULL,
    jsonb_build_object(
      'revision', '2026-07-27-v3',
      'templates', jsonb_build_array(
        'ADMIN_CLIENT_INVITATION',
        'ADMIN_MEMBERSHIP_ASSIGNED'
      ),
      'approvedTemplates', approved_template_count,
      'reason', 'Management approved the requested admin client invitation and membership assignment emails.'
    ),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("id") DO NOTHING;
END $$;
