UPDATE "ClassTemplate"
SET "dropInPriceCents" = 2800
WHERE "isEvent" = false;

UPDATE "ClassOccurrence" AS occurrence
SET "priceCents" = 2800
FROM "ClassTemplate" AS template
WHERE occurrence."templateId" = template."id"
  AND template."isEvent" = false;
