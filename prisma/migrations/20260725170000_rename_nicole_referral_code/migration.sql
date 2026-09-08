UPDATE "ReferralCode"
SET "code" = 'NICOLERZ26'
WHERE "code" = 'JESSICARZ26'
  AND "instructorId" IN (
    SELECT "id" FROM "User" WHERE "email" = 'nicole-finley@rhyze.local'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "ReferralAttribution"
    WHERE "ReferralAttribution"."referralCodeId" = "ReferralCode"."id"
  );
