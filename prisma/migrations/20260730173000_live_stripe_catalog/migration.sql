UPDATE "Product"
SET "stripePriceId" = CASE "slug"
  WHEN 'elevate' THEN 'price_1TywwvRIYui0I7dPqMzxcmQd'
  WHEN 'ritual' THEN 'price_1TywxzRIYui0I7dPY3SDXyJl'
  WHEN 'vip-access-pass' THEN 'price_1TywyURIYui0I7dPhCe5Ijwk'
  WHEN 'intro-offer' THEN 'price_1TywyxRIYui0I7dPwRtnyJMB'
  WHEN 'drop-in' THEN 'price_1TywzPRIYui0I7dPIBdnLlhy'
  WHEN 'og-rhyze-tribe-2026' THEN 'price_1TywzqRIYui0I7dP1a6e0fJc'
  ELSE "stripePriceId"
END,
"updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" IN (
  'elevate',
  'ritual',
  'vip-access-pass',
  'intro-offer',
  'drop-in',
  'og-rhyze-tribe-2026'
);

-- This customer was created during pre-launch test-mode checkout. Clearing only
-- that known test record lets Stripe create and persist a live customer without
-- affecting any existing Somble/live Stripe customer relationship.
UPDATE "User"
SET "stripeCustomerId" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "stripeCustomerId" = 'cus_UxY0HggeLUrGDK';
