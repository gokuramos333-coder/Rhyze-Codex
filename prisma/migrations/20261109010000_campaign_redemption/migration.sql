-- Permanent successful use, separate from member-wide in-flight serialization.
CREATE TABLE "CampaignRedemption" (
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
 "campaignId" TEXT NOT NULL REFERENCES "DiscountCampaign"("id") ON DELETE RESTRICT,
 "purchaseId" TEXT NOT NULL UNIQUE REFERENCES "Purchase"("id") ON DELETE RESTRICT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("userId", "campaignId")
);
-- Conservative: refunds never restore eligibility. Duplicate historical successes
-- fail migration for reconciliation, rather than silently discarding evidence.
INSERT INTO "CampaignRedemption" ("userId","campaignId","purchaseId")
SELECT "userId","discountCampaignId","id" FROM "Purchase"
WHERE "discountCampaignId" IS NOT NULL AND "status" IN ('PAID','PARTIALLY_REFUNDED','REFUNDED');
CREATE FUNCTION retain_campaign_redemption() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."discountCampaignId" IS NOT NULL AND NEW."status" IN ('PAID','PARTIALLY_REFUNDED','REFUNDED') THEN
  INSERT INTO "CampaignRedemption" ("userId","campaignId","purchaseId")
  VALUES (NEW."userId",NEW."discountCampaignId",NEW."id")
  ON CONFLICT ("purchaseId") DO NOTHING;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER retain_campaign_redemption AFTER INSERT OR UPDATE ON "Purchase"
FOR EACH ROW EXECUTE FUNCTION retain_campaign_redemption();
