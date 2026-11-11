-- One permanent normalized namespace across all campaign/referral writers,
-- including catalog scripts and old application processes. Never recycle codes.
-- Existing ambiguity aborts this migration; no history is deleted or prioritized.
LOCK TABLE "ReferralCode", "DiscountCampaign" IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE "DiscountCodeNamespace" (
  "code" TEXT PRIMARY KEY,
  "source" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  CONSTRAINT "DiscountCodeNamespace_source" CHECK ("source" IN ('ReferralCode', 'DiscountCampaign', 'Reserved'))
);
INSERT INTO "DiscountCodeNamespace" VALUES ('RHYZE2026', 'Reserved', 'RHYZE2026');
INSERT INTO "DiscountCodeNamespace" ("code", "source", "sourceId")
SELECT upper(btrim("code")), 'ReferralCode', "id" FROM "ReferralCode"
UNION ALL
SELECT upper(btrim("code")), 'DiscountCampaign', "id" FROM "DiscountCampaign";
CREATE FUNCTION reserve_discount_code_namespace() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE existing_source TEXT; existing_id TEXT;
BEGIN
  INSERT INTO "DiscountCodeNamespace" ("code", "source", "sourceId")
  VALUES (upper(btrim(NEW."code")), TG_TABLE_NAME, NEW."id")
  ON CONFLICT ("code") DO UPDATE SET "code" = EXCLUDED."code"
  RETURNING "source", "sourceId" INTO existing_source, existing_id;
  IF existing_source <> TG_TABLE_NAME OR existing_id <> NEW."id" THEN
    RAISE EXCEPTION 'Discount code namespace is already reserved' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER referral_code_namespace BEFORE INSERT OR UPDATE OF "code", "id" ON "ReferralCode"
FOR EACH ROW EXECUTE FUNCTION reserve_discount_code_namespace();
CREATE TRIGGER campaign_code_namespace BEFORE INSERT OR UPDATE OF "code", "id" ON "DiscountCampaign"
FOR EACH ROW EXECUTE FUNCTION reserve_discount_code_namespace();
