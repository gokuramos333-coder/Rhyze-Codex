UPDATE "Product"
SET
  "availabilityStart" = TIMESTAMP '2026-08-03 04:00:00',
  "alwaysAvailable" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "kind" = 'INTRO_TRIAL'
  AND "priceCents" = 700;
