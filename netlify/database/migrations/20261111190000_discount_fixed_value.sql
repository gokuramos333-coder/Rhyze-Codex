-- Add fixed commercial values without removing the existing 1..99 percent CHECK.
-- NULL is reserved for the other value variant; the new CHECK closes both-null.
ALTER TABLE "DiscountCampaign" ALTER COLUMN "percentOff" DROP NOT NULL;
ALTER TABLE "DiscountCampaign" ADD COLUMN "amountOffCents" INTEGER;
ALTER TABLE "DiscountCampaign" ADD CONSTRAINT "DiscountCampaign_value" CHECK (
 ("percentOff" IS NOT NULL AND "amountOffCents" IS NULL) OR
 ("percentOff" IS NULL AND "amountOffCents" IS NOT NULL AND "amountOffCents" > 0)
);
ALTER TABLE "Purchase" ADD COLUMN "discountQuote" JSONB;
