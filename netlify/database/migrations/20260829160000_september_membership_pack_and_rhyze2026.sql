-- September 2026 membership catalog launch.
-- 8-Class Pack becomes a quarterly renewing class-pack membership starting Sept 1.
-- VIP regular price moves to $222/month so RHYZE2026 can discount eligible new-member purchases for only the first two months in Stripe Checkout.

INSERT INTO "Product" (
  "id",
  "name",
  "slug",
  "description",
  "kind",
  "priceCents",
  "billingInterval",
  "includedCredits",
  "isUnlimited",
  "eligibleCategoryIds",
  "trialDays",
  "cancellationPolicy",
  "isPublic",
  "isActive",
  "availabilityStart",
  "availabilityEnd",
  "alwaysAvailable",
  "displayOrder",
  "customPlanType",
  "stripePriceId",
  "createdAt",
  "updatedAt"
)
VALUES (
  'product-eight-class-pack-2026',
  '8-Class Pack',
  'eight-class-pack',
  'Includes 8 standard class credits valid for 3 months. Auto-renews every 3 months unless cancelled at least 14 days before renewal. Unused credits expire at the end of each 3-month period.',
  'CLASS_PACK',
  17900,
  'MONTHLY',
  8,
  false,
  ARRAY[]::text[],
  NULL,
  'Auto-renews every 3 months unless cancelled at least 14 days before renewal. Unused credits expire at the end of each 3-month period.',
  true,
  true,
  TIMESTAMP '2026-09-01 04:00:00',
  NULL,
  false,
  25,
  'QUARTERLY_8_CLASS_PACK',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "kind" = EXCLUDED."kind",
  "priceCents" = EXCLUDED."priceCents",
  "billingInterval" = EXCLUDED."billingInterval",
  "includedCredits" = EXCLUDED."includedCredits",
  "isUnlimited" = EXCLUDED."isUnlimited",
  "eligibleCategoryIds" = EXCLUDED."eligibleCategoryIds",
  "trialDays" = EXCLUDED."trialDays",
  "cancellationPolicy" = EXCLUDED."cancellationPolicy",
  "isPublic" = EXCLUDED."isPublic",
  "isActive" = EXCLUDED."isActive",
  "availabilityStart" = EXCLUDED."availabilityStart",
  "availabilityEnd" = EXCLUDED."availabilityEnd",
  "alwaysAvailable" = EXCLUDED."alwaysAvailable",
  "displayOrder" = EXCLUDED."displayOrder",
  "customPlanType" = EXCLUDED."customPlanType",
  "stripePriceId" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Product"
SET "priceCents" = 22200,
    "stripePriceId" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'vip-access-pass';
