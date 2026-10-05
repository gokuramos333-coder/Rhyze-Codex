-- Owner requested member + management failure notices and explicitly approved this release.
INSERT INTO "EmailTemplateReview" (
  "id", "template", "revision", "approvedAt", "approvedById", "approvedByEmail", "createdAt", "updatedAt"
) VALUES (
  'email-admin-payment-failed-20261005', 'ADMIN_PAYMENT_FAILED', '2026-07-27-v3',
  CURRENT_TIMESTAMP, 'SYSTEM', 'gui@westaffnj.com', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT ("template") DO NOTHING;

INSERT INTO "AuditLog" ("id", "actorId", "action", "entityType", "entityId", "after", "createdAt")
VALUES ('rhyze-payment-failure-alerts-approved-20261005', NULL,
  'email.payment-failure-alerts-approved', 'EmailTemplateReview', 'ADMIN_PAYMENT_FAILED',
  jsonb_build_object('reason', 'Owner explicitly requested and approved failed membership payment alerts to Melissa and Vanessa plus admin portal notifications.',
    'recipients', jsonb_build_array('melissa@rhyzefit.com', 'vanessa@rhyzefit.com'), 'revision', '2026-07-27-v3'), CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;
