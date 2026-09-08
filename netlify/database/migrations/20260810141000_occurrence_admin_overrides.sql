ALTER TABLE "ClassOccurrence"
  ADD COLUMN "titleOverride" TEXT,
  ADD COLUMN "substituteInstructorName" TEXT,
  ADD COLUMN "isSubstitute" BOOLEAN NOT NULL DEFAULT false;
