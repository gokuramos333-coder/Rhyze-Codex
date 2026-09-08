DO $$
DECLARE
  missing_template_count INTEGER;
  missing_instructor_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO missing_template_count
  FROM "ClassTemplate"
  WHERE "slug" IN (
    'yoga-vinyasa-mackenzie',
    'pilates-pulse-adrianna',
    'yoga-flow-adrianna',
    'ignite-julie',
    'heels-101-walk-with-me-nicole'
  );

  IF missing_template_count <> 5 THEN
    RAISE EXCEPTION 'Expected all August 30-31 repair class templates';
  END IF;

  SELECT COUNT(*)
  INTO missing_instructor_count
  FROM (
    SELECT DISTINCT LOWER("email") AS instructor_email
    FROM "User"
    WHERE "status" = 'ACTIVE'
      AND LOWER("email") IN (
        'kenzie41796@gmail.com',
        'a.altajones@gmail.com',
        'gritandgracefitnessnj@gmail.com',
        'nicolesak303@gmail.com'
      )
  ) instructors;

  IF missing_instructor_count <> 4 THEN
    RAISE EXCEPTION 'Expected all August 30-31 repair instructors';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Room" WHERE "name" = 'Main Floor' AND "isActive" = true
  ) THEN
    RAISE EXCEPTION 'The active Main Floor room is missing';
  END IF;
END $$;

WITH repair_slots (
  local_date, local_time, template_slug, instructor_email, duration_minutes,
  title_override, display_instructor_name, is_substitute
) AS (
  VALUES
    ('2026-08-30', '09:00', 'yoga-vinyasa-mackenzie', 'kenzie41796@gmail.com', 50, 'Vinyasa/Hatha Yoga', 'Kenzie', false),
    ('2026-08-31', '10:00', 'pilates-pulse-adrianna', 'a.altajones@gmail.com', 50, NULL, NULL, false),
    ('2026-08-31', '11:00', 'yoga-flow-adrianna', 'a.altajones@gmail.com', 50, NULL, NULL, false),
    ('2026-08-31', '12:00', 'ignite-julie', 'gritandgracefitnessnj@gmail.com', 50, NULL, NULL, false),
    ('2026-08-31', '18:10', 'heels-101-walk-with-me-nicole', 'nicolesak303@gmail.com', 50, NULL, NULL, false)
), resolved_slots AS (
  SELECT
    slot.*,
    template."id" AS template_id,
    template."defaultCapacity" AS default_capacity,
    template."dropInPriceCents" AS drop_in_price_cents,
    template."isEvent" AS is_event,
    instructor."id" AS instructor_id,
    profile."standardClassRateCents" AS standard_rate,
    profile."specialtyEventRateCents" AS specialty_rate,
    COALESCE(
      (
        SELECT prior."roomId"
        FROM "ClassOccurrence" prior
        WHERE prior."templateId" = template."id" AND prior."roomId" IS NOT NULL
        ORDER BY prior."startAt" DESC
        LIMIT 1
      ),
      (
        SELECT room."id"
        FROM "Room" room
        WHERE room."name" = 'Main Floor' AND room."isActive" = true
        ORDER BY room."createdAt" ASC
        LIMIT 1
      )
    ) AS room_id,
    ((slot.local_date || ' ' || slot.local_time)::timestamp AT TIME ZONE 'America/New_York') AS start_at,
    ((slot.local_date || ' ' || slot.local_time)::timestamp AT TIME ZONE 'America/New_York') + (slot.duration_minutes * INTERVAL '1 minute') AS end_at
  FROM repair_slots slot
  JOIN "ClassTemplate" template ON template."slug" = slot.template_slug
  JOIN "User" instructor ON LOWER(instructor."email") = LOWER(slot.instructor_email)
    AND instructor."status" = 'ACTIVE'
  LEFT JOIN "InstructorProfile" profile ON profile."userId" = instructor."id"
), updated_existing AS (
  UPDATE "ClassOccurrence" occurrence
  SET "instructorId" = resolved."instructor_id",
      "roomId" = COALESCE(occurrence."roomId", resolved."room_id"),
      "startAt" = resolved."start_at",
      "endAt" = resolved."end_at",
      "timezone" = 'America/New_York',
      "capacity" = COALESCE(occurrence."capacity", resolved."default_capacity"),
      "priceCents" = COALESCE(occurrence."priceCents", resolved."drop_in_price_cents"),
      "status" = 'SCHEDULED'::"OccurrenceStatus",
      "titleOverride" = resolved."title_override",
      "substituteInstructorName" = resolved."display_instructor_name",
      "isSubstitute" = resolved."is_substitute",
      "instructorPayMethod" = CASE WHEN resolved."is_event" THEN 'SPECIALTY_EVENT_RATE' ELSE 'STANDARD_CLASS_RATE' END,
      "instructorPayCents" = CASE
        WHEN resolved."is_event" THEN COALESCE(resolved."specialty_rate", resolved."standard_rate", 4000)
        ELSE COALESCE(resolved."standard_rate", 4000)
      END,
      "instructorPayNote" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
  FROM resolved_slots resolved
  WHERE occurrence."templateId" = resolved."template_id"
    AND occurrence."startAt" = resolved."start_at"
  RETURNING occurrence."id"
)
INSERT INTO "ClassOccurrence" (
  "id", "templateId", "seriesId", "instructorId", "roomId", "startAt",
  "endAt", "timezone", "capacity", "priceCents", "status", "publicNotes",
  "internalNotes", "titleOverride", "substituteInstructorName", "isSubstitute",
  "historicalSignupCount", "instructorPayMethod", "instructorPayCents",
  "instructorPayNote", "createdAt", "updatedAt"
)
SELECT
  'rhyze-aug-2026-' || REPLACE(local_date, '-', '') || '-' || REPLACE(local_time, ':', '') || '-' || template_slug,
  template_id,
  NULL,
  instructor_id,
  room_id,
  start_at,
  end_at,
  'America/New_York',
  default_capacity,
  drop_in_price_cents,
  'SCHEDULED'::"OccurrenceStatus",
  NULL,
  NULL,
  title_override,
  display_instructor_name,
  is_substitute,
  0,
  CASE WHEN is_event THEN 'SPECIALTY_EVENT_RATE' ELSE 'STANDARD_CLASS_RATE' END,
  CASE
    WHEN is_event THEN COALESCE(specialty_rate, standard_rate, 4000)
    ELSE COALESCE(standard_rate, 4000)
  END,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM resolved_slots resolved
WHERE NOT EXISTS (
  SELECT 1
  FROM "ClassOccurrence" occurrence
  WHERE occurrence."templateId" = resolved."template_id"
    AND occurrence."startAt" = resolved."start_at"
)
ON CONFLICT ("id") DO UPDATE SET
  "instructorId" = EXCLUDED."instructorId",
  "roomId" = EXCLUDED."roomId",
  "startAt" = EXCLUDED."startAt",
  "endAt" = EXCLUDED."endAt",
  "timezone" = EXCLUDED."timezone",
  "capacity" = EXCLUDED."capacity",
  "priceCents" = EXCLUDED."priceCents",
  "status" = EXCLUDED."status",
  "titleOverride" = EXCLUDED."titleOverride",
  "substituteInstructorName" = EXCLUDED."substituteInstructorName",
  "isSubstitute" = EXCLUDED."isSubstitute",
  "instructorPayMethod" = EXCLUDED."instructorPayMethod",
  "instructorPayCents" = EXCLUDED."instructorPayCents",
  "instructorPayNote" = EXCLUDED."instructorPayNote",
  "updatedAt" = CURRENT_TIMESTAMP;

DO $$
DECLARE
  repaired_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO repaired_count
  FROM "ClassOccurrence" occurrence
  JOIN "ClassTemplate" template ON template."id" = occurrence."templateId"
  WHERE occurrence."status" = 'SCHEDULED'
    AND (
      occurrence."startAt" AT TIME ZONE 'UTC'
      AT TIME ZONE COALESCE(occurrence."timezone", 'America/New_York')
    )::date IN (DATE '2026-08-30', DATE '2026-08-31')
    AND template."slug" IN (
      'yoga-vinyasa-mackenzie',
      'pilates-pulse-adrianna',
      'yoga-flow-adrianna',
      'ignite-julie',
      'heels-101-walk-with-me-nicole'
    );

  IF repaired_count < 5 THEN
    RAISE EXCEPTION 'Expected at least 5 repaired August 30-31 class occurrences, found %', repaired_count;
  END IF;

  INSERT INTO "AuditLog" (
    "id", "actorId", "action", "entityType", "entityId", "after", "createdAt"
  ) VALUES (
    'restore-august-30-31-2026-schedule',
    NULL,
    'schedule.production.restored',
    'ClassOccurrence',
    'august-30-31-2026',
    jsonb_build_object(
      'dates', ARRAY['2026-08-30', '2026-08-31'],
      'expectedOccurrenceCount', 5,
      'repairedOccurrenceCount', repaired_count
    ),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("id") DO UPDATE SET
    "action" = EXCLUDED."action",
    "after" = EXCLUDED."after";
END $$;
