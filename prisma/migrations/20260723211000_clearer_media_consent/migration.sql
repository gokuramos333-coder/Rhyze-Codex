WITH current_agreement AS (
  SELECT "title", "body", "requiresSign"
  FROM "WaiverVersion"
  WHERE "isActive" = true
  ORDER BY "effectiveAt" DESC
  LIMIT 1
),
deactivated AS (
  UPDATE "WaiverVersion"
  SET "isActive" = false, "updatedAt" = NOW()
  WHERE "isActive" = true
)
INSERT INTO "WaiverVersion" (
  "id",
  "version",
  "title",
  "body",
  "effectiveAt",
  "isActive",
  "requiresSign",
  "createdAt",
  "updatedAt"
)
SELECT
  'rhyze-agreement-media-2026-07-23',
  (SELECT COALESCE(MAX("version"), 0) + 1 FROM "WaiverVersion"),
  current_agreement."title",
  REPLACE(
    current_agreement."body",
    'Media permission is optional. Declining media consent does not affect booking access.',
    'Optional media consent: I give Rhyze Fitness permission to photograph or record me and use my image or likeness for its website, social media, advertising, and promotional materials. I understand that I will not be paid and may withdraw permission for future use by contacting Rhyze Fitness. Leaving this option unchecked will not affect membership, booking, or class participation.'
  ),
  NOW(),
  true,
  current_agreement."requiresSign",
  NOW(),
  NOW()
FROM current_agreement;
