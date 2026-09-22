-- Approved account corrections. History, Stripe identifiers, invitation state,
-- receipts and existing bookings remain unchanged. No external billing action.
UPDATE "Product"
SET "description" = TRIM(REPLACE("description", 'Founding members lock in $199/month for life', '')),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'vip-access-pass'
  AND "description" LIKE '%Founding members lock in $199/month for life%';

DO $$
DECLARE person RECORD;
DECLARE plan_id TEXT := 'rhyze-complimentary-standard-20260921';
DECLARE purchase_id TEXT;
DECLARE membership_id TEXT;
BEGIN
  -- Exact stale GUI row only; a new/current paid membership is not touched.
  UPDATE "Membership" SET "status" = 'EXPIRED', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = 'cms2itzxj0003w9oyar7fsnef'
    AND "userId" = 'cmrxy10qa0000w9wuvdigdqkc'
    AND "currentPeriodEnd" <= '2026-08-28T00:00:00Z'
    AND "status" IN ('ACTIVE', 'TRIALING', 'PAST_DUE', 'PAUSED');

  FOR person IN SELECT * FROM (VALUES
    ('cmryg3hz1002sw9wroppyn4dl', 'carmenbula@gmail.com', 'cms446ve0006ul7090yok1wr8'),
    ('cmryg3hz2002xw9wr9b8i4rig', 'nessyagudelo@hotmail.com', 'cms446vd8006pl709jwcw9vwm')
  ) AS approved(user_id, email, legacy_membership_id)
  LOOP
    -- Absent targets (e.g. an empty preview DB) are not fabricated.
    IF NOT EXISTS (SELECT 1 FROM "User" WHERE id = person.user_id) THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM "User" WHERE id = person.user_id AND LOWER(email) = person.email) THEN
      RAISE EXCEPTION 'Reviewed complimentary account identity changed: %', person.user_id;
    END IF;
    purchase_id := 'complimentary-standard-20260921:' || person.user_id;
    membership_id := purchase_id || ':membership';
    IF EXISTS (SELECT 1 FROM "Membership" WHERE "userId" = person.user_id
      AND status IN ('ACTIVE','TRIALING','PAST_DUE','PAUSED')
      AND id NOT IN (person.legacy_membership_id, membership_id)) THEN
      RAISE EXCEPTION 'Unexpected current membership on reviewed complimentary account: %', person.user_id;
    END IF;
    IF EXISTS (SELECT 1 FROM "Membership" WHERE id = person.legacy_membership_id
      AND ("stripeSubscriptionId" IS NOT NULL OR "purchaseId" IS NOT NULL)) THEN
      RAISE EXCEPTION 'Reviewed legacy membership now has billing; manual review required: %', person.user_id;
    END IF;

    INSERT INTO "Product" (id, name, slug, description, kind, "priceCents", "billingInterval", "isUnlimited",
      "eligibleCategoryIds", "isPublic", "isActive", "customPlanType", "createdAt", "updatedAt")
    VALUES (plan_id, 'Complimentary regular classes', 'complimentary-standard-20260921',
      'Admin-approved free unlimited regular classes. Special events excluded. No recurring payment.',
      'MONTHLY_UNLIMITED', 0, 'ONE_TIME', true, ARRAY[]::TEXT[], false, true, 'COMPLIMENTARY_STANDARD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO NOTHING;
    UPDATE "Membership" SET status = 'EXPIRED', "updatedAt" = CURRENT_TIMESTAMP
    WHERE id = person.legacy_membership_id AND "userId" = person.user_id;
    INSERT INTO "Purchase" (id, "userId", "productId", status, "amountCents", "paidAt", "createdAt", "updatedAt")
    VALUES (purchase_id, person.user_id, plan_id, 'PAID', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO "Membership" (id, "userId", "productId", "purchaseId", status, "currentPeriodStart", "activatedAt", "createdAt", "updatedAt")
    VALUES (membership_id, person.user_id, plan_id, purchase_id, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO "CreditAccount" (id, "userId", "sourcePurchaseId", label, "isUnlimited", "validFrom", "createdAt", "updatedAt")
    VALUES (purchase_id || ':credits', person.user_id, purchase_id, 'Complimentary regular classes — events excluded', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;
