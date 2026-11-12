-- Independent redemption availability and subscription benefit duration.
ALTER TABLE "DiscountCampaign" ALTER COLUMN "endsAt" DROP NOT NULL;
ALTER TABLE "DiscountCampaign" ADD COLUMN "duration" TEXT NOT NULL DEFAULT 'once', ADD COLUMN "durationMonths" INTEGER;
ALTER TABLE "DiscountCampaign" ADD CONSTRAINT "DiscountCampaign_duration_check" CHECK (
  ("duration" IN ('once','forever') AND "durationMonths" IS NULL)
  OR ("duration" = 'repeating' AND "durationMonths" IS NOT NULL AND "durationMonths" BETWEEN 1 AND 600)
);
