ALTER TABLE "InstructorProfile"
ADD COLUMN "specialtyEventRateText" TEXT;

CREATE TABLE "MembershipFreeze" (
  "id" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "activatedAt" TIMESTAMP(3),
  "resumedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MembershipFreeze_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MembershipFreeze_membershipId_startAt_endAt_idx"
ON "MembershipFreeze"("membershipId", "startAt", "endAt");

CREATE INDEX "MembershipFreeze_startAt_endAt_cancelledAt_idx"
ON "MembershipFreeze"("startAt", "endAt", "cancelledAt");

ALTER TABLE "MembershipFreeze"
ADD CONSTRAINT "MembershipFreeze_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MembershipFreeze"
ADD CONSTRAINT "MembershipFreeze_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "ClassTemplate" SET "defaultCapacity" = 25;
UPDATE "ClassOccurrence" SET "capacity" = 25;
UPDATE "ClassSeries" SET "capacity" = 25 WHERE "capacity" IS NOT NULL;
UPDATE "Room" SET "capacity" = 25 WHERE "capacity" IS NOT NULL;

UPDATE "InstructorProfile"
SET "standardClassRateCents" = 0
WHERE "userId" IN (
  SELECT "id" FROM "User"
  WHERE LOWER("email") IN ('vanessa@rhyzefit.com', 'melissa@rhyzefit.com')
);
