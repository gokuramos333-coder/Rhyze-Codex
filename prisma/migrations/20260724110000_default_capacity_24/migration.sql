UPDATE "ClassTemplate"
SET "defaultCapacity" = 24;

UPDATE "ClassOccurrence"
SET "capacity" = 24;

UPDATE "ClassSeries"
SET "capacity" = 24
WHERE "capacity" IS NOT NULL;

UPDATE "Room"
SET "capacity" = 24
WHERE "isActive" = TRUE;
