DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ClassOccurrence" occurrence
    WHERE occurrence."startAt" >= TIMESTAMPTZ '2026-09-01 00:00:00 America/New_York'
      AND occurrence."startAt" < TIMESTAMPTZ '2026-10-01 00:00:00 America/New_York'
      AND (
        EXISTS (SELECT 1 FROM "Booking" booking WHERE booking."occurrenceId" = occurrence."id")
        OR EXISTS (SELECT 1 FROM "WaitlistEntry" waitlist WHERE waitlist."occurrenceId" = occurrence."id")
        OR EXISTS (SELECT 1 FROM "AttendanceRecord" attendance WHERE attendance."occurrenceId" = occurrence."id")
        OR EXISTS (SELECT 1 FROM "ClassMessage" message WHERE message."occurrenceId" = occurrence."id")
        OR EXISTS (SELECT 1 FROM "CommerceOrder" commerce WHERE commerce."occurrenceId" = occurrence."id")
      )
  ) THEN
    RAISE EXCEPTION 'Refusing to replace September classes with related records';
  END IF;
END $$;

INSERT INTO "ClassTemplate" (
  "id", "categoryId", "name", "slug", "description", "durationMinutes",
  "intensity", "defaultCapacity", "dropInPriceCents", "tags", "equipment",
  "isActive", "isEvent", "archivedAt", "createdAt", "updatedAt"
)
SELECT
  'rhyze-work-and-tone-2026', category."id", 'Work & Tone',
  'work-tone-mswoy36a',
  'Forget isolated reps. Work & Tone is a rhythm-driven, total-body conditioning class designed to challenge your strength, stability, and endurance to the beat of the music. Come ready to sweat, lock into the rhythm, and do the work.',
  50, 'ALL_LEVELS'::"ClassIntensity", 20, 2500,
  ARRAY['NEW!'::text, 'Rhythm-driven conditioning'::text], ARRAY[]::text[],
  true, false, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ClassCategory" category
WHERE category."slug" = 'strength'
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "durationMinutes" = EXCLUDED."durationMinutes",
  "isActive" = true,
  "isEvent" = false,
  "archivedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "ClassTemplate" (
  "id", "categoryId", "name", "slug", "description", "durationMinutes",
  "intensity", "defaultCapacity", "dropInPriceCents", "tags", "equipment",
  "isActive", "isEvent", "archivedAt", "createdAt", "updatedAt"
)
SELECT
  'rhyze-mommy-and-me-2026', category."id", 'Mommy & Me',
  'mommy-and-me-dennisse',
  'A 45-minute specialty event for one parent and child. Full class details coming soon.',
  45, 'ALL_LEVELS'::"ClassIntensity", 25, 3000,
  ARRAY['NEW!'::text, 'Parent & child'::text], ARRAY[]::text[],
  true, true, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ClassCategory" category
WHERE category."slug" = 'dance'
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "durationMinutes" = EXCLUDED."durationMinutes",
  "dropInPriceCents" = EXCLUDED."dropInPriceCents",
  "isActive" = true,
  "isEvent" = true,
  "archivedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "ClassTemplate"
SET "durationMinutes" = 30,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'pound-mackenzie';

DO $$
DECLARE
  required_template_count INTEGER;
  required_instructor_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO required_template_count
  FROM "ClassTemplate"
  WHERE "slug" IN (
    'yoga-vinyasa-mackenzie', 'global-hiit-mackenzie', 'pound-mackenzie',
    'pilates-pulse-adrianna', 'yoga-flow-adrianna', 'ignite-julie',
    'rhyze-ritmo-melissa', 'soul-line-dancing-rachel', 'rhyze-up-vanessa',
    'real-riddim-dance-workout-vanessa', 'work-tone-mswoy36a',
    'heels-101-walk-with-me-nicole', 'tcj-hip-hop-happy-hour-tricia',
    'seat-seduction-vanessa', 'hypnotic-heels-nicole', 'mommy-and-me-dennisse'
  );
  IF required_template_count <> 16 THEN
    RAISE EXCEPTION 'Expected all 16 September class templates';
  END IF;

  SELECT COUNT(*)
  INTO required_instructor_count
  FROM (
    SELECT DISTINCT LOWER("name") AS instructor_name
    FROM "User"
    WHERE "status" = 'ACTIVE'
      AND LOWER("name") IN (
        'adrianna jones', 'julie reese', 'mackenzie heffernan',
        'melissa llanos', 'nicole finley', 'rachel',
        'tricia johnsen', 'vanessa ramos'
      )
  ) instructors;
  IF required_instructor_count <> 8 THEN
    RAISE EXCEPTION 'Expected all 8 September instructors';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Room" WHERE "name" = 'Main Floor' AND "isActive" = true
  ) THEN
    RAISE EXCEPTION 'The active Main Floor room is missing';
  END IF;
END $$;

DELETE FROM "ClassOccurrence"
WHERE "startAt" >= TIMESTAMPTZ '2026-09-01 00:00:00 America/New_York'
  AND "startAt" < TIMESTAMPTZ '2026-10-01 00:00:00 America/New_York';

WITH schedule_slots (
  local_date, local_time, template_slug, instructor_name, duration_minutes,
  title_override, display_instructor_name, is_substitute, planned_instructor
) AS (
  VALUES
    ('2026-09-01', '07:00', 'yoga-vinyasa-mackenzie', 'Mackenzie Heffernan', 50, 'Power Yoga', 'Kenzie', false, NULL),
    ('2026-09-01', '11:00', 'rhyze-ritmo-melissa', 'Melissa Llanos', 50, NULL, NULL, false, NULL),
    ('2026-09-01', '18:00', 'soul-line-dancing-rachel', 'Rachel', 50, NULL, NULL, false, NULL),
    ('2026-09-01', '19:10', 'rhyze-ritmo-melissa', 'Melissa Llanos', 50, NULL, NULL, false, NULL),
    ('2026-09-02', '07:15', 'pilates-pulse-adrianna', 'Adrianna Jones', 50, NULL, NULL, false, NULL),
    ('2026-09-02', '11:00', 'yoga-flow-adrianna', 'Adrianna Jones', 50, 'Yoga Sculpt', NULL, false, NULL),
    ('2026-09-02', '12:00', 'ignite-julie', 'Julie Reese', 50, NULL, NULL, false, NULL),
    ('2026-09-02', '19:10', 'real-riddim-dance-workout-vanessa', NULL, 50, 'Real Riddim', 'Dennisse', true, 'Dennisse'),
    ('2026-09-03', '07:00', 'global-hiit-mackenzie', 'Mackenzie Heffernan', 50, 'Global Fit & Flow', 'Kenzie', false, NULL),
    ('2026-09-03', '11:00', 'rhyze-ritmo-melissa', 'Melissa Llanos', 50, NULL, NULL, false, NULL),
    ('2026-09-03', '19:10', 'rhyze-ritmo-melissa', 'Melissa Llanos', 50, NULL, NULL, false, NULL),
    ('2026-09-05', '11:00', 'work-tone-mswoy36a', NULL, 50, NULL, 'Avery', false, 'Avery'),
    ('2026-09-06', '09:00', 'yoga-vinyasa-mackenzie', 'Mackenzie Heffernan', 50, 'Vinyasa/Hatha Yoga', 'Kenzie', false, NULL),
    ('2026-09-07', '09:00', 'pilates-pulse-adrianna', 'Adrianna Jones', 50, NULL, NULL, false, NULL),
    ('2026-09-08', '07:00', 'yoga-vinyasa-mackenzie', 'Mackenzie Heffernan', 50, 'Power Yoga', 'Kenzie', false, NULL),
    ('2026-09-08', '11:00', 'rhyze-ritmo-melissa', 'Melissa Llanos', 50, NULL, NULL, false, NULL),
    ('2026-09-08', '18:00', 'soul-line-dancing-rachel', 'Rachel', 50, NULL, NULL, false, NULL),
    ('2026-09-08', '19:10', 'rhyze-up-vanessa', 'Vanessa Ramos', 50, NULL, NULL, false, NULL),
    ('2026-09-09', '07:15', 'pilates-pulse-adrianna', 'Adrianna Jones', 50, NULL, NULL, false, NULL),
    ('2026-09-09', '11:00', 'yoga-flow-adrianna', 'Adrianna Jones', 50, 'Yoga Sculpt', NULL, false, NULL),
    ('2026-09-09', '12:00', 'ignite-julie', 'Julie Reese', 50, NULL, NULL, false, NULL),
    ('2026-09-09', '18:00', 'work-tone-mswoy36a', NULL, 50, NULL, 'Avery', false, 'Avery'),
    ('2026-09-09', '19:10', 'real-riddim-dance-workout-vanessa', 'Vanessa Ramos', 50, NULL, NULL, false, NULL),
    ('2026-09-10', '07:00', 'global-hiit-mackenzie', 'Mackenzie Heffernan', 50, 'Global Fit & Flow', 'Kenzie', false, NULL),
    ('2026-09-10', '11:00', 'rhyze-ritmo-melissa', 'Melissa Llanos', 50, NULL, NULL, false, NULL),
    ('2026-09-10', '19:10', 'rhyze-up-vanessa', 'Vanessa Ramos', 50, NULL, NULL, false, NULL),
    ('2026-09-12', '11:00', 'work-tone-mswoy36a', NULL, 50, NULL, 'Avery', false, 'Avery'),
    ('2026-09-12', '12:00', 'real-riddim-dance-workout-vanessa', NULL, 50, 'Real Riddim', 'Dennisse', false, 'Dennisse'),
    ('2026-09-13', '09:00', 'yoga-vinyasa-mackenzie', 'Mackenzie Heffernan', 50, 'Vinyasa/Hatha Yoga', 'Kenzie', false, NULL),
    ('2026-09-14', '12:00', 'ignite-julie', 'Julie Reese', 50, NULL, NULL, false, NULL),
    ('2026-09-14', '16:30', 'pound-mackenzie', 'Mackenzie Heffernan', 30, 'POUND', 'Kenzie', false, NULL),
    ('2026-09-14', '17:10', 'global-hiit-mackenzie', 'Mackenzie Heffernan', 50, 'Global Fit & Flow', 'Kenzie', false, NULL),
    ('2026-09-14', '19:15', 'tcj-hip-hop-happy-hour-tricia', 'Tricia Johnsen', 75, NULL, NULL, false, NULL),
    ('2026-09-15', '07:00', 'yoga-vinyasa-mackenzie', 'Mackenzie Heffernan', 50, 'Power Yoga', 'Kenzie', false, NULL),
    ('2026-09-15', '11:00', 'rhyze-ritmo-melissa', 'Melissa Llanos', 50, NULL, NULL, false, NULL),
    ('2026-09-15', '18:00', 'soul-line-dancing-rachel', 'Rachel', 50, NULL, NULL, false, NULL),
    ('2026-09-15', '19:10', 'rhyze-up-vanessa', 'Vanessa Ramos', 50, NULL, NULL, false, NULL),
    ('2026-09-16', '07:15', 'pilates-pulse-adrianna', 'Adrianna Jones', 50, NULL, NULL, false, NULL),
    ('2026-09-16', '11:00', 'yoga-flow-adrianna', 'Adrianna Jones', 50, 'Yoga Sculpt', NULL, false, NULL),
    ('2026-09-16', '12:00', 'ignite-julie', 'Julie Reese', 50, NULL, NULL, false, NULL),
    ('2026-09-16', '18:00', 'work-tone-mswoy36a', NULL, 50, NULL, 'Avery', false, 'Avery'),
    ('2026-09-16', '19:10', 'real-riddim-dance-workout-vanessa', 'Vanessa Ramos', 50, NULL, NULL, false, NULL),
    ('2026-09-17', '07:00', 'global-hiit-mackenzie', 'Mackenzie Heffernan', 50, 'Global Fit & Flow', 'Kenzie', false, NULL),
    ('2026-09-17', '11:00', 'rhyze-ritmo-melissa', 'Melissa Llanos', 50, NULL, NULL, false, NULL),
    ('2026-09-17', '18:00', 'heels-101-walk-with-me-nicole', 'Nicole Finley', 50, NULL, NULL, false, NULL),
    ('2026-09-17', '19:10', 'rhyze-up-vanessa', 'Vanessa Ramos', 50, NULL, NULL, false, NULL),
    ('2026-09-18', '18:45', 'seat-seduction-vanessa', 'Vanessa Ramos', 75, NULL, NULL, false, NULL),
    ('2026-09-19', '11:00', 'work-tone-mswoy36a', NULL, 50, NULL, 'Avery', false, 'Avery'),
    ('2026-09-19', '12:00', 'real-riddim-dance-workout-vanessa', NULL, 50, 'Real Riddim', 'Dennisse', false, 'Dennisse'),
    ('2026-09-20', '09:00', 'yoga-vinyasa-mackenzie', 'Mackenzie Heffernan', 50, 'Vinyasa/Hatha Yoga', 'Kenzie', false, NULL),
    ('2026-09-21', '12:00', 'ignite-julie', 'Julie Reese', 50, NULL, NULL, false, NULL),
    ('2026-09-21', '16:30', 'pound-mackenzie', 'Mackenzie Heffernan', 30, 'POUND', 'Kenzie', false, NULL),
    ('2026-09-21', '17:10', 'global-hiit-mackenzie', 'Mackenzie Heffernan', 50, 'Global Fit & Flow', 'Kenzie', false, NULL),
    ('2026-09-22', '07:00', 'yoga-vinyasa-mackenzie', 'Mackenzie Heffernan', 50, 'Power Yoga', 'Kenzie', false, NULL),
    ('2026-09-22', '11:00', 'rhyze-ritmo-melissa', 'Melissa Llanos', 50, NULL, NULL, false, NULL),
    ('2026-09-22', '18:00', 'soul-line-dancing-rachel', 'Rachel', 50, NULL, NULL, false, NULL),
    ('2026-09-22', '19:10', 'rhyze-up-vanessa', 'Vanessa Ramos', 50, NULL, NULL, false, NULL),
    ('2026-09-23', '07:15', 'pilates-pulse-adrianna', 'Adrianna Jones', 50, NULL, NULL, false, NULL),
    ('2026-09-23', '11:00', 'yoga-flow-adrianna', 'Adrianna Jones', 50, 'Yoga Sculpt', NULL, false, NULL),
    ('2026-09-23', '12:00', 'ignite-julie', 'Julie Reese', 50, NULL, NULL, false, NULL),
    ('2026-09-23', '18:00', 'work-tone-mswoy36a', NULL, 50, NULL, 'Avery', false, 'Avery'),
    ('2026-09-23', '19:10', 'real-riddim-dance-workout-vanessa', 'Vanessa Ramos', 50, NULL, NULL, false, NULL),
    ('2026-09-24', '07:00', 'global-hiit-mackenzie', 'Mackenzie Heffernan', 50, 'Global Fit & Flow', 'Kenzie', false, NULL),
    ('2026-09-24', '11:00', 'rhyze-ritmo-melissa', 'Melissa Llanos', 50, NULL, NULL, false, NULL),
    ('2026-09-24', '18:10', 'rhyze-up-vanessa', 'Vanessa Ramos', 50, NULL, NULL, false, NULL),
    ('2026-09-24', '19:15', 'hypnotic-heels-nicole', 'Nicole Finley', 75, NULL, NULL, false, NULL),
    ('2026-09-26', '11:00', 'work-tone-mswoy36a', NULL, 50, NULL, 'Avery', false, 'Avery'),
    ('2026-09-26', '12:00', 'mommy-and-me-dennisse', NULL, 45, NULL, NULL, false, 'Dennisse'),
    ('2026-09-27', '09:00', 'yoga-vinyasa-mackenzie', 'Mackenzie Heffernan', 50, 'Vinyasa/Hatha Yoga', 'Kenzie', false, NULL),
    ('2026-09-28', '12:00', 'ignite-julie', 'Julie Reese', 50, NULL, NULL, false, NULL),
    ('2026-09-28', '16:30', 'pound-mackenzie', 'Mackenzie Heffernan', 30, 'POUND', 'Kenzie', false, NULL),
    ('2026-09-28', '17:10', 'global-hiit-mackenzie', 'Mackenzie Heffernan', 50, 'Global Fit & Flow', 'Kenzie', false, NULL),
    ('2026-09-29', '07:00', 'yoga-vinyasa-mackenzie', 'Mackenzie Heffernan', 50, 'Power Yoga', 'Kenzie', false, NULL),
    ('2026-09-29', '11:00', 'rhyze-ritmo-melissa', 'Melissa Llanos', 50, NULL, NULL, false, NULL),
    ('2026-09-29', '18:00', 'soul-line-dancing-rachel', 'Rachel', 50, NULL, NULL, false, NULL),
    ('2026-09-29', '19:10', 'rhyze-up-vanessa', 'Vanessa Ramos', 50, NULL, NULL, false, NULL),
    ('2026-09-30', '07:15', 'pilates-pulse-adrianna', 'Adrianna Jones', 50, NULL, NULL, false, NULL),
    ('2026-09-30', '11:00', 'yoga-flow-adrianna', 'Adrianna Jones', 50, 'Yoga Sculpt', NULL, false, NULL),
    ('2026-09-30', '12:00', 'ignite-julie', 'Julie Reese', 50, NULL, NULL, false, NULL),
    ('2026-09-30', '18:00', 'work-tone-mswoy36a', NULL, 50, NULL, 'Avery', false, 'Avery'),
    ('2026-09-30', '19:10', 'real-riddim-dance-workout-vanessa', 'Vanessa Ramos', 50, NULL, NULL, false, NULL)
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
    ) AS room_id
  FROM schedule_slots slot
  JOIN "ClassTemplate" template ON template."slug" = slot.template_slug
  LEFT JOIN LATERAL (
    SELECT active_user."id"
    FROM "User" active_user
    WHERE active_user."status" = 'ACTIVE'
      AND LOWER(active_user."name") = LOWER(slot.instructor_name)
    ORDER BY CASE WHEN active_user."role" = 'OWNER' THEN 0 ELSE 1 END, active_user."createdAt" ASC
    LIMIT 1
  ) instructor ON slot.instructor_name IS NOT NULL
  LEFT JOIN "InstructorProfile" profile ON profile."userId" = instructor."id"
)
INSERT INTO "ClassOccurrence" (
  "id", "templateId", "seriesId", "instructorId", "roomId", "startAt",
  "endAt", "timezone", "capacity", "priceCents", "status", "publicNotes",
  "internalNotes", "titleOverride", "substituteInstructorName", "isSubstitute",
  "historicalSignupCount", "instructorPayMethod", "instructorPayCents",
  "instructorPayNote", "createdAt", "updatedAt"
)
SELECT
  'rhyze-sep-2026-' || REPLACE(local_date, '-', '') || '-' || REPLACE(local_time, ':', '') || '-' || template_slug,
  template_id,
  NULL,
  instructor_id,
  room_id,
  ((local_date || ' ' || local_time)::timestamp AT TIME ZONE 'America/New_York'),
  ((local_date || ' ' || local_time)::timestamp AT TIME ZONE 'America/New_York') + (duration_minutes * INTERVAL '1 minute'),
  'America/New_York',
  default_capacity,
  drop_in_price_cents,
  'SCHEDULED'::"OccurrenceStatus",
  CASE
    WHEN template_slug = 'mommy-and-me-dennisse'
      THEN 'NEW! $30 per parent with one child; $5 for each additional child.'
    ELSE NULL
  END,
  CASE
    WHEN planned_instructor IS NOT NULL
      THEN 'Planned instructor: ' || planned_instructor || '. Assign after instructor profile is created.'
    ELSE NULL
  END,
  title_override,
  display_instructor_name,
  is_substitute,
  0,
  CASE WHEN is_event THEN 'SPECIALTY_EVENT_RATE' ELSE 'STANDARD_CLASS_RATE' END,
  CASE
    WHEN instructor_id IS NULL THEN NULL
    WHEN is_event THEN COALESCE(specialty_rate, standard_rate, 4000)
    ELSE COALESCE(standard_rate, 4000)
  END,
  CASE WHEN instructor_id IS NULL THEN 'Set instructor and pay when the instructor profile is ready.' ELSE NULL END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM resolved_slots;

DO $$
DECLARE
  inserted_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO inserted_count
  FROM "ClassOccurrence"
  WHERE "startAt" >= TIMESTAMPTZ '2026-09-01 00:00:00 America/New_York'
    AND "startAt" < TIMESTAMPTZ '2026-10-01 00:00:00 America/New_York'
    AND "status" = 'SCHEDULED';

  IF inserted_count <> 81 THEN
    RAISE EXCEPTION 'Expected 81 September class occurrences, created %', inserted_count;
  END IF;

  INSERT INTO "AuditLog" (
    "id", "actorId", "action", "entityType", "entityId", "after", "createdAt"
  ) VALUES (
    'preview-september-2026-schedule',
    NULL,
    'schedule.production.loaded',
    'ClassOccurrence',
    'september-2026',
    jsonb_build_object('occurrenceCount', inserted_count, 'environment', 'production'),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("id") DO UPDATE SET
    "action" = EXCLUDED."action",
    "after" = EXCLUDED."after";
END $$;
