CREATE TABLE "DiscountCampaign" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "code" TEXT NOT NULL UNIQUE,
 "percentOff" INTEGER NOT NULL CHECK ("percentOff" BETWEEN 1 AND 99),
 "productIds" TEXT[] NOT NULL CHECK (cardinality("productIds") BETWEEN 1 AND 100),
 "startsAt" TIMESTAMP(3) NOT NULL,
 "endsAt" TIMESTAMP(3) NOT NULL,
 "enabled" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "DiscountCampaign_window" CHECK ("endsAt" > "startsAt"),
 CONSTRAINT "DiscountCampaign_code" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' AND "code" <> 'RHYZE2026')
);
ALTER TABLE "Purchase" ADD COLUMN "discountCampaignId" TEXT;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_discountCampaignId_fkey" FOREIGN KEY ("discountCampaignId") REFERENCES "DiscountCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
