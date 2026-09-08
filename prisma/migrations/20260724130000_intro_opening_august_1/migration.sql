UPDATE "Product"
SET
  "alwaysAvailable" = FALSE,
  "availabilityStart" = TIMESTAMP '2026-08-01 04:00:00',
  "availabilityEnd" = NULL
WHERE "slug" = 'intro-offer'
   OR ("kind" = 'INTRO_TRIAL' AND "priceCents" = 700);
