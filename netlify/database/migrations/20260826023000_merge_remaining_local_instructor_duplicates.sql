DO $$
DECLARE
  merge_record RECORD;
  local_user_id TEXT;
  real_user_id TEXT;
  moved_occurrences INTEGER;
  moved_series INTEGER;
BEGIN
  FOR merge_record IN
    SELECT * FROM (VALUES
      ('adrianna-jones@rhyze.local', 'a.altajones@gmail.com', 'Adrianna Jones'),
      ('mackenzie-heffernan@rhyze.local', 'kenzie41796@gmail.com', 'Mackenzie Heffernan'),
      ('nicole-finley@rhyze.local', 'nicolesak303@gmail.com', 'Nicole Finley')
    ) AS mapping(local_email, real_email, instructor_name)
  LOOP
    SELECT local_user."id", real_user."id"
    INTO local_user_id, real_user_id
    FROM "User" AS local_user
    CROSS JOIN "User" AS real_user
    WHERE LOWER(local_user."email") = merge_record.local_email
      AND LOWER(real_user."email") = merge_record.real_email;

    IF local_user_id IS NULL OR real_user_id IS NULL THEN
      RAISE EXCEPTION 'Instructor duplicate merge expected both local and real accounts for %', merge_record.instructor_name;
    END IF;

    UPDATE "InstructorProfile" AS target
    SET
      "bio" = COALESCE(NULLIF(target."bio", ''), source."bio"),
      "photoUrl" = COALESCE(target."photoUrl", source."photoUrl"),
      "isActive" = TRUE,
      "canEditOwnProfile" = TRUE,
      "displayOrder" = LEAST(target."displayOrder", source."displayOrder"),
      "standardClassRateCents" = COALESCE(target."standardClassRateCents", source."standardClassRateCents"),
      "specialtyEventRateCents" = COALESCE(target."specialtyEventRateCents", source."specialtyEventRateCents"),
      "specialtyEventRateText" = COALESCE(target."specialtyEventRateText", source."specialtyEventRateText"),
      "updatedAt" = CURRENT_TIMESTAMP
    FROM "InstructorProfile" AS source
    WHERE target."userId" = real_user_id
      AND source."userId" = local_user_id;

    UPDATE "User"
    SET "name" = merge_record.instructor_name,
        "role" = 'INSTRUCTOR',
        "status" = 'ACTIVE',
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = real_user_id;

    WITH moved AS (
      UPDATE "ClassOccurrence"
      SET "instructorId" = real_user_id,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "instructorId" = local_user_id
        AND "startAt" >= CURRENT_TIMESTAMP
      RETURNING "id"
    )
    SELECT COUNT(*) INTO moved_occurrences FROM moved;

    WITH moved AS (
      UPDATE "ClassSeries"
      SET "instructorId" = real_user_id,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "instructorId" = local_user_id
      RETURNING "id"
    )
    SELECT COUNT(*) INTO moved_series FROM moved;

    UPDATE "InstructorProfile"
    SET "isActive" = FALSE,
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = local_user_id;

    UPDATE "User"
    SET "role" = 'MEMBER',
        "status" = 'ARCHIVED',
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = local_user_id;

    UPDATE "ReferralCode"
    SET "isActive" = FALSE,
        "deactivatedAt" = COALESCE("deactivatedAt", CURRENT_TIMESTAMP)
    WHERE "instructorId" = local_user_id;

    INSERT INTO "AuditLog" (
      "id", "actorId", "action", "entityType", "entityId", "before", "after", "createdAt"
    ) VALUES (
      'rhyze-local-instructor-duplicate-merge-20260826-' || regexp_replace(merge_record.instructor_name, '[^A-Za-z0-9]+', '-', 'g'),
      NULL,
      'instructor.accounts-merged',
      'User',
      real_user_id,
      jsonb_build_object(
        'placeholderUserId', local_user_id,
        'placeholderEmail', merge_record.local_email
      ),
      jsonb_build_object(
        'activeUserId', real_user_id,
        'email', merge_record.real_email,
        'photoAndBioCopied', TRUE,
        'futureOccurrencesReassigned', moved_occurrences,
        'seriesReassigned', moved_series,
        'placeholderArchived', TRUE
      ),
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("id") DO NOTHING;
  END LOOP;
END $$;
