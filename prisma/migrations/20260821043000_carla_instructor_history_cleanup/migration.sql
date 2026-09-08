DO $$
DECLARE
  carla_user_id TEXT;
  taught_occurrence_id TEXT;
  taught_occurrence_count INTEGER;
  confirmed_booking_count INTEGER;
  detached_occurrence_count INTEGER;
BEGIN
  SELECT u."id"
  INTO carla_user_id
  FROM "User" u
  WHERE LOWER(u."email") = 'carla-hotrock@rhyze.local';

  IF carla_user_id IS NULL THEN
    RAISE EXCEPTION 'Carla Hotrock instructor account was not found';
  END IF;

  SELECT COUNT(*), MIN(co."id")
  INTO taught_occurrence_count, taught_occurrence_id
  FROM "ClassOccurrence" co
  JOIN "ClassTemplate" ct ON ct."id" = co."templateId"
  WHERE ct."slug" = 'grind-and-grow-carla-reo'
    AND co."startAt" = '2026-08-05T22:00:00.000Z';

  IF taught_occurrence_count <> 1 THEN
    RAISE EXCEPTION 'Carla history cleanup expected exactly one August 5 taught-class occurrence';
  END IF;

  SELECT COUNT(*)
  INTO confirmed_booking_count
  FROM "Booking" b
  WHERE b."occurrenceId" = taught_occurrence_id
    AND b."status" = 'CONFIRMED';

  IF confirmed_booking_count <> 1 THEN
    RAISE EXCEPTION 'Carla history cleanup expected exactly one confirmed member on the taught class';
  END IF;

  SELECT COUNT(*)
  INTO detached_occurrence_count
  FROM "ClassOccurrence" co
  WHERE co."instructorId" = carla_user_id
    AND co."id" <> taught_occurrence_id;

  UPDATE "ClassOccurrence"
  SET "instructorId" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "instructorId" = carla_user_id
    AND "id" <> taught_occurrence_id;

  UPDATE "ClassOccurrence"
  SET "instructorId" = carla_user_id,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = taught_occurrence_id;

  UPDATE "ClassSeries"
  SET "instructorId" = NULL,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "instructorId" = carla_user_id;

  UPDATE "User"
  SET "role" = 'MEMBER',
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = carla_user_id
    AND "role" = 'INSTRUCTOR';

  UPDATE "InstructorProfile"
  SET "isActive" = false,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "userId" = carla_user_id;

  UPDATE "ReferralCode"
  SET "isActive" = false,
      "deactivatedAt" = COALESCE("deactivatedAt", CURRENT_TIMESTAMP)
  WHERE "instructorId" = carla_user_id;

  INSERT INTO "InstructorApplication" (
    "id", "userId", "status", "reviewedAt", "reviewNote", "createdAt", "updatedAt"
  ) VALUES (
    'rhyze-carla-revoked-20260821',
    carla_user_id,
    'REJECTED',
    CURRENT_TIMESTAMP,
    'Removed from the instructor team by management.',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("userId") DO UPDATE
  SET "status" = 'REJECTED',
      "reviewedAt" = CURRENT_TIMESTAMP,
      "reviewNote" = 'Removed from the instructor team by management.',
      "updatedAt" = CURRENT_TIMESTAMP;

  INSERT INTO "AuditLog" (
    "id", "actorId", "action", "entityType", "entityId", "before", "after", "createdAt"
  ) VALUES (
    'rhyze-carla-history-cleanup-20260821',
    NULL,
    'instructor.history-cleaned',
    'User',
    carla_user_id,
    jsonb_build_object('linkedOccurrences', detached_occurrence_count + 1),
    jsonb_build_object(
      'role', 'MEMBER',
      'profileActive', false,
      'keptOccurrenceId', taught_occurrence_id,
      'detachedOccurrences', detached_occurrence_count,
      'confirmedMembersOnKeptClass', confirmed_booking_count
    ),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("id") DO NOTHING;
END $$;
