INSERT INTO "Product" (
  "id", "name", "slug", "description", "kind", "priceCents",
  "billingInterval", "includedCredits", "isUnlimited", "eligibleCategoryIds",
  "cancellationPolicy", "isPublic", "isActive", "availabilityStart",
  "availabilityEnd", "alwaysAvailable", "displayOrder", "createdAt", "updatedAt"
)
VALUES (
  'rhyze-erika-gifted-vip-2026',
  'UNLIMITED CREDITS VIP',
  'erika-rivera-gifted-vip',
  'Gifted exclusively to Erika Rivera for her help. Unlimited standard classes through February 1, 2027.',
  'VIP', 0, 'ONE_TIME', NULL, true, ARRAY[]::TEXT[],
  'Gifted access ends after February 1, 2027. Specialty events and workshops are excluded.',
  false, true, '2026-08-03T23:15:00.000Z', '2027-02-02T04:59:59.999Z',
  false, 999, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "kind" = EXCLUDED."kind",
  "priceCents" = EXCLUDED."priceCents",
  "billingInterval" = EXCLUDED."billingInterval",
  "includedCredits" = EXCLUDED."includedCredits",
  "isUnlimited" = EXCLUDED."isUnlimited",
  "cancellationPolicy" = EXCLUDED."cancellationPolicy",
  "isPublic" = false,
  "isActive" = true,
  "availabilityStart" = EXCLUDED."availabilityStart",
  "availabilityEnd" = EXCLUDED."availabilityEnd",
  "alwaysAvailable" = false,
  "displayOrder" = EXCLUDED."displayOrder",
  "updatedAt" = CURRENT_TIMESTAMP;

DO $$
DECLARE
  erika_user_id TEXT;
  gifted_product_id TEXT;
BEGIN
  SELECT "id" INTO erika_user_id FROM "User"
   WHERE LOWER("email") = 'erikamun78@gmail.com' LIMIT 1;

  IF erika_user_id IS NULL THEN
    RAISE EXCEPTION 'Erika Rivera account was not found';
  END IF;

  SELECT "id" INTO gifted_product_id FROM "Product"
   WHERE "slug" = 'erika-rivera-gifted-vip';

  UPDATE "Membership"
     SET "status" = 'EXPIRED',
         "currentPeriodEnd" = '2026-08-03T23:15:00.000Z',
         "updatedAt" = CURRENT_TIMESTAMP
   WHERE "userId" = erika_user_id
     AND "id" <> 'rhyze-erika-gifted-vip-membership-2026'
     AND "status" IN ('ACTIVE', 'TRIALING', 'PAUSED', 'PAST_DUE');

  INSERT INTO "Membership" (
    "id", "userId", "productId", "purchaseId", "status", "stripeSubscriptionId",
    "currentPeriodStart", "currentPeriodEnd", "activatedAt", "cancelAtPeriodEnd",
    "createdAt", "updatedAt"
  )
  VALUES (
    'rhyze-erika-gifted-vip-membership-2026', erika_user_id, gifted_product_id,
    NULL, 'ACTIVE', NULL, '2026-08-03T23:15:00.000Z',
    '2027-02-02T04:59:59.999Z', '2026-08-03T23:15:00.000Z', false,
    '2026-08-03T23:15:00.000Z', CURRENT_TIMESTAMP
  )
  ON CONFLICT ("id") DO UPDATE SET
    "userId" = EXCLUDED."userId",
    "productId" = EXCLUDED."productId",
    "status" = 'ACTIVE',
    "currentPeriodStart" = EXCLUDED."currentPeriodStart",
    "currentPeriodEnd" = EXCLUDED."currentPeriodEnd",
    "activatedAt" = EXCLUDED."activatedAt",
    "cancelAtPeriodEnd" = false,
    "updatedAt" = CURRENT_TIMESTAMP;

  INSERT INTO "CreditAccount" (
    "id", "userId", "sourcePurchaseId", "label", "isUnlimited", "validFrom",
    "validUntil", "createdAt", "updatedAt"
  )
  VALUES (
    'rhyze-erika-gifted-vip-credit-2026', erika_user_id, NULL,
    'UNLIMITED CREDITS VIP', true, '2026-08-03T23:15:00.000Z',
    '2027-02-02T04:59:59.999Z', '2026-08-03T23:15:00.000Z', CURRENT_TIMESTAMP
  )
  ON CONFLICT ("id") DO UPDATE SET
    "userId" = EXCLUDED."userId",
    "label" = EXCLUDED."label",
    "isUnlimited" = true,
    "validFrom" = EXCLUDED."validFrom",
    "validUntil" = EXCLUDED."validUntil",
    "updatedAt" = CURRENT_TIMESTAMP;
END $$;
