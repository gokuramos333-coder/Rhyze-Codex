UPDATE "ClassTemplate"
SET
  "dropInPriceCents" = 2500,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "isEvent" = false;

UPDATE "ClassOccurrence" AS occurrence
SET
  "priceCents" = 2500,
  "updatedAt" = CURRENT_TIMESTAMP
FROM "ClassTemplate" AS template
WHERE occurrence."templateId" = template."id"
  AND template."isEvent" = false;

UPDATE "Product"
SET
  "priceCents" = 2500,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "kind" = 'DROP_IN';
