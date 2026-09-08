ALTER TABLE "InstructorProfile"
ADD COLUMN "standardClassRateCents" INTEGER DEFAULT 4000,
ADD COLUMN "specialtyEventRateCents" INTEGER;

UPDATE "InstructorProfile"
SET "standardClassRateCents" = 4000
WHERE "standardClassRateCents" IS NULL;
