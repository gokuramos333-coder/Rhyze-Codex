ALTER TABLE "ClassOccurrence"
ADD COLUMN "historicalSignupCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Product"
ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "customPlanType" TEXT;

ALTER TABLE "Membership"
ADD COLUMN "activatedAt" TIMESTAMP(3);
