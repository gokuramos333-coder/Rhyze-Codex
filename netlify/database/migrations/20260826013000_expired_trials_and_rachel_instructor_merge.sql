DO $$
DECLARE
  placeholder_rachel_id TEXT;
  active_rachel_id TEXT;
  expired_membership_count INTEGER := 0;
  synced_credit_count INTEGER := 0;
  reassigned_occurrence_count INTEGER := 0;
  reassigned_series_count INTEGER := 0;
BEGIN
  -- Backfill any intro-trial activation window that is still missing from the
  -- first eligible standard-class booking, then expire every trial whose
  -- seven-day window has passed.
  WITH first_trial_class AS (
    SELECT
      booking."userId",
      MIN(occurrence."startAt") AS "firstClassAt"
    FROM "Booking" AS booking
    JOIN "ClassOccurrence" AS occurrence ON occurrence."id" = booking."occurrenceId"
    JOIN "ClassTemplate" AS template ON template."id" = occurrence."templateId"
    WHERE booking."status" IN ('CONFIRMED', 'ATTENDED')
      AND template."isEvent" = FALSE
      AND booking."policySnapshot"->>'accessType' = 'INTRO_TRIAL'
    GROUP BY booking."userId"
  )
  UPDATE "Membership" AS membership
  SET
    "activatedAt" = COALESCE(membership."activatedAt", first_trial_class."firstClassAt"),
    "currentPeriodStart" = COALESCE(membership."currentPeriodStart", membership."activatedAt", first_trial_class."firstClassAt"),
    "currentPeriodEnd" = COALESCE(
      membership."currentPeriodEnd",
      first_trial_class."firstClassAt" + INTERVAL '7 days'
    ),
    "updatedAt" = CURRENT_TIMESTAMP
  FROM "Product" AS product, first_trial_class
  WHERE product."id" = membership."productId"
    AND product."kind" = 'INTRO_TRIAL'
    AND membership."userId" = first_trial_class."userId"
    AND membership."status" IN ('TRIALING', 'ACTIVE')
    AND (membership."activatedAt" IS NULL OR membership."currentPeriodEnd" IS NULL);

  WITH expired_intro AS (
    SELECT
      membership."id" AS membership_id,
      membership."userId",
      membership."purchaseId",
      membership."currentPeriodEnd"
    FROM "Membership" AS membership
    JOIN "Product" AS product ON product."id" = membership."productId"
    WHERE product."kind" = 'INTRO_TRIAL'
      AND membership."status" IN ('TRIALING', 'ACTIVE')
      AND membership."activatedAt" IS NOT NULL
      AND membership."currentPeriodEnd" <= CURRENT_TIMESTAMP
  ), updated_credits AS (
    UPDATE "CreditAccount" AS account
    SET
      "validUntil" = expired_intro."currentPeriodEnd",
      "updatedAt" = CURRENT_TIMESTAMP
    FROM expired_intro
    WHERE (
        account."sourcePurchaseId" = expired_intro."purchaseId"
        OR (
          account."sourcePurchaseId" IS NULL
          AND account."userId" = expired_intro."userId"
          AND account."isUnlimited" = TRUE
          AND LOWER(account."label") LIKE '%trial%'
        )
      )
      AND (account."validUntil" IS NULL OR account."validUntil" > CURRENT_TIMESTAMP)
    RETURNING account."id"
  )
  SELECT COUNT(*) INTO synced_credit_count FROM updated_credits;

  WITH expired AS (
    UPDATE "Membership" AS membership
    SET "status" = 'EXPIRED', "updatedAt" = CURRENT_TIMESTAMP
    FROM "Product" AS product
    WHERE product."id" = membership."productId"
      AND product."kind" = 'INTRO_TRIAL'
      AND membership."status" IN ('TRIALING', 'ACTIVE')
      AND membership."activatedAt" IS NOT NULL
      AND membership."currentPeriodEnd" <= CURRENT_TIMESTAMP
    RETURNING membership."id", membership."userId", membership."currentPeriodEnd"
  )
  SELECT COUNT(*) INTO expired_membership_count FROM expired;

  IF expired_membership_count > 0 OR synced_credit_count > 0 THEN
    INSERT INTO "AuditLog" (
      "id", "actorId", "action", "entityType", "entityId", "after", "createdAt"
    ) VALUES (
      'rhyze-expired-intro-trial-repair-20260826',
      NULL,
      'memberships.expired-intro-trials-repaired',
      'Membership',
      NULL,
      jsonb_build_object(
        'expiredMemberships', expired_membership_count,
        'syncedTrialCredits', synced_credit_count,
        'rule', 'Expire intro-trial access seven days after first eligible standard-class booking.'
      ),
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("id") DO NOTHING;
  END IF;

  SELECT "id" INTO placeholder_rachel_id
  FROM "User"
  WHERE LOWER("email") = 'rachel@rhyze.local';

  SELECT "id" INTO active_rachel_id
  FROM "User"
  WHERE LOWER("email") = 'rrose973@yahoo.com';

  IF placeholder_rachel_id IS NULL OR active_rachel_id IS NULL THEN
    RAISE EXCEPTION 'Rachel instructor merge expected both placeholder and real-email accounts';
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
  WHERE target."userId" = active_rachel_id
    AND source."userId" = placeholder_rachel_id;

  UPDATE "User"
  SET "name" = 'Rachel Crowe', "role" = 'INSTRUCTOR', "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = active_rachel_id;

  WITH moved_occurrences AS (
    UPDATE "ClassOccurrence"
    SET "instructorId" = active_rachel_id, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "instructorId" = placeholder_rachel_id
      AND "startAt" >= CURRENT_TIMESTAMP
    RETURNING "id"
  )
  SELECT COUNT(*) INTO reassigned_occurrence_count FROM moved_occurrences;

  WITH moved_series AS (
    UPDATE "ClassSeries"
    SET "instructorId" = active_rachel_id, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "instructorId" = placeholder_rachel_id
    RETURNING "id"
  )
  SELECT COUNT(*) INTO reassigned_series_count FROM moved_series;

  UPDATE "InstructorProfile"
  SET "isActive" = FALSE, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "userId" = placeholder_rachel_id;

  UPDATE "User"
  SET "role" = 'MEMBER', "status" = 'ARCHIVED', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = placeholder_rachel_id;

  UPDATE "ReferralCode"
  SET "isActive" = FALSE,
      "deactivatedAt" = COALESCE("deactivatedAt", CURRENT_TIMESTAMP)
  WHERE "instructorId" = placeholder_rachel_id;

  INSERT INTO "AuditLog" (
    "id", "actorId", "action", "entityType", "entityId", "before", "after", "createdAt"
  ) VALUES (
    'rhyze-rachel-crowe-instructor-merge-20260826',
    NULL,
    'instructor.accounts-merged',
    'User',
    active_rachel_id,
    jsonb_build_object('placeholderUserId', placeholder_rachel_id, 'placeholderEmail', 'rachel@rhyze.local'),
    jsonb_build_object(
      'activeUserId', active_rachel_id,
      'email', 'rrose973@yahoo.com',
      'photoAndBioCopied', TRUE,
      'futureOccurrencesReassigned', reassigned_occurrence_count,
      'seriesReassigned', reassigned_series_count,
      'placeholderArchived', TRUE
    ),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("id") DO NOTHING;
END $$;
