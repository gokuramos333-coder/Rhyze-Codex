ALTER TABLE "ClassOccurrence"
  ADD COLUMN IF NOT EXISTS "instructorPayMethod" TEXT NOT NULL DEFAULT 'STANDARD_CLASS_RATE',
  ADD COLUMN IF NOT EXISTS "instructorPayCents" INTEGER,
  ADD COLUMN IF NOT EXISTS "instructorPayNote" TEXT;

UPDATE "ClassOccurrence" AS occurrence
SET
  "instructorPayMethod" = CASE WHEN template."isEvent" THEN 'SPECIALTY_EVENT_RATE' ELSE 'STANDARD_CLASS_RATE' END,
  "instructorPayCents" = CASE
    WHEN template."isEvent" THEN COALESCE(
      (SELECT profile."specialtyEventRateCents" FROM "InstructorProfile" AS profile WHERE profile."userId" = occurrence."instructorId"),
      (SELECT profile."standardClassRateCents" FROM "InstructorProfile" AS profile WHERE profile."userId" = occurrence."instructorId"),
      4000
    )
    ELSE COALESCE(
      (SELECT profile."standardClassRateCents" FROM "InstructorProfile" AS profile WHERE profile."userId" = occurrence."instructorId"),
      4000
    )
  END
FROM "ClassTemplate" AS template
WHERE occurrence."templateId" = template."id";
