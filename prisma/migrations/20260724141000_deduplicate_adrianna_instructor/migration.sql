DO $$
DECLARE
  legacy_id TEXT;
  canonical_id TEXT;
BEGIN
  SELECT "id" INTO legacy_id
  FROM "User"
  WHERE "email" = 'adrianna@rhyze.local';

  SELECT "id" INTO canonical_id
  FROM "User"
  WHERE "email" = 'adrianna-jones@rhyze.local';

  IF legacy_id IS NOT NULL AND canonical_id IS NOT NULL THEN
    UPDATE "ClassOccurrence"
    SET "instructorId" = canonical_id
    WHERE "instructorId" = legacy_id;

    UPDATE "ClassSeries"
    SET "instructorId" = canonical_id
    WHERE "instructorId" = legacy_id;

    UPDATE "ClassMessage"
    SET "instructorId" = canonical_id
    WHERE "instructorId" = legacy_id;

    UPDATE "InstructorCredential"
    SET "instructorId" = canonical_id
    WHERE "instructorId" = legacy_id;

    UPDATE "ReferralCode"
    SET "instructorId" = canonical_id
    WHERE "instructorId" = legacy_id;

    UPDATE "ReferralCommission"
    SET "instructorId" = canonical_id
    WHERE "instructorId" = legacy_id;

    UPDATE "BookingTransfer"
    SET "instructorId" = canonical_id
    WHERE "instructorId" = legacy_id;

    DELETE FROM "User"
    WHERE "id" = legacy_id;
  END IF;
END $$;
