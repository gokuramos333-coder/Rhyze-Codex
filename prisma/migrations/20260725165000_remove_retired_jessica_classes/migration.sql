DELETE FROM "ClassTemplate"
WHERE "slug" IN (
  'dance-fit-jessica',
  'hypnotic-heels-jessica-weekly-class',
  'hypnotic-heels-nicole-weekly-class'
)
AND NOT EXISTS (
  SELECT 1
  FROM "ClassOccurrence"
  WHERE "ClassOccurrence"."templateId" = "ClassTemplate"."id"
);
