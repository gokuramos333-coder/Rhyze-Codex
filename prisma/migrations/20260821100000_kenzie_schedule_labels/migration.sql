DO $$
DECLARE
  kenzie_user_id TEXT;
  labor_day_occurrence_id TEXT;
  labor_day_occurrence_count INTEGER;
  labor_day_schedule_count INTEGER;
BEGIN
  SELECT u."id"
  INTO kenzie_user_id
  FROM "User" u
  WHERE LOWER(u."email") = 'kenzie41796@gmail.com'
     OR (LOWER(u."name") = 'mackenzie heffernan' AND u."status" = 'ACTIVE')
  ORDER BY CASE WHEN LOWER(u."email") = 'kenzie41796@gmail.com' THEN 0 ELSE 1 END
  LIMIT 1;

  IF kenzie_user_id IS NULL THEN
    RAISE EXCEPTION 'Kenzie instructor account was not found';
  END IF;

  UPDATE "ClassTemplate"
  SET "name" = CASE "slug"
    WHEN 'global-hiit-mackenzie' THEN 'Global Fit & Flow with Kenzie'
    WHEN 'yoga-vinyasa-mackenzie' THEN 'Vinyasa/Hatha Yoga with Kenzie'
    WHEN 'pound-mackenzie' THEN 'POUND with Kenzie'
    ELSE "name"
  END,
  "updatedAt" = CURRENT_TIMESTAMP
  WHERE "slug" IN (
    'global-hiit-mackenzie',
    'yoga-vinyasa-mackenzie',
    'pound-mackenzie'
  );

  UPDATE "ClassOccurrence" co
  SET "substituteInstructorName" = 'Kenzie',
      "titleOverride" = CASE
        WHEN ct."slug" = 'global-hiit-mackenzie' THEN 'Global Fit & Flow'
        WHEN ct."slug" = 'pound-mackenzie' THEN 'POUND'
        WHEN ct."slug" = 'yoga-vinyasa-mackenzie'
          AND EXTRACT(
            DOW FROM (
              co."startAt" AT TIME ZONE 'UTC'
              AT TIME ZONE COALESCE(co."timezone", 'America/New_York')
            )
          ) = 0
          THEN 'Vinyasa/Hatha Yoga'
        ELSE REGEXP_REPLACE(
          COALESCE(co."titleOverride", ''),
          'Mackenzie',
          'Kenzie',
          'gi'
        )
      END,
      "updatedAt" = CURRENT_TIMESTAMP
  FROM "ClassTemplate" ct
  WHERE co."templateId" = ct."id"
    AND co."instructorId" = kenzie_user_id
    AND co."startAt" >= '2026-08-21T04:00:00.000Z';

  UPDATE "ClassOccurrence"
  SET "titleOverride" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "instructorId" = kenzie_user_id
    AND "startAt" >= '2026-08-21T04:00:00.000Z'
    AND "titleOverride" = '';

  SELECT COUNT(*), MIN(co."id")
  INTO labor_day_occurrence_count, labor_day_occurrence_id
  FROM "ClassOccurrence" co
  JOIN "ClassTemplate" ct ON ct."id" = co."templateId"
  WHERE ct."slug" = 'pilates-pulse-adrianna'
    AND (
      co."startAt" AT TIME ZONE 'UTC'
      AT TIME ZONE COALESCE(co."timezone", 'America/New_York')
    )::date = DATE '2026-09-07'
    AND co."status" = 'SCHEDULED';

  IF labor_day_occurrence_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Labor Day Pilates occurrence';
  END IF;

  SELECT COUNT(*)
  INTO labor_day_schedule_count
  FROM "ClassOccurrence" co
  WHERE (
    co."startAt" AT TIME ZONE 'UTC'
    AT TIME ZONE COALESCE(co."timezone", 'America/New_York')
  )::date = DATE '2026-09-07'
    AND co."status" = 'SCHEDULED';

  IF labor_day_schedule_count <> 1 THEN
    RAISE EXCEPTION 'Labor Day must have exactly one scheduled class';
  END IF;

  UPDATE "ClassOccurrence"
  SET "publicNotes" = 'Labor Day! This is the only class scheduled today.',
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = labor_day_occurrence_id;

  INSERT INTO "AuditLog" (
    "id", "actorId", "action", "entityType", "entityId", "after", "createdAt"
  ) VALUES (
    'rhyze-kenzie-schedule-labels-20260821',
    NULL,
    'schedule.kenzie-labels-updated',
    'User',
    kenzie_user_id,
    jsonb_build_object(
      'displayName', 'Kenzie',
      'sundayClassTitle', 'Vinyasa/Hatha Yoga',
      'laborDayOccurrenceId', labor_day_occurrence_id
    ),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("id") DO NOTHING;
END $$;
