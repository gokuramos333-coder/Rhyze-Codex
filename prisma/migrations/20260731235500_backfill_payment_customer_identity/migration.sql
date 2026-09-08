UPDATE "CommerceOrder" AS "order"
SET "customerName" = COALESCE(
  "order"."customerName",
  (SELECT "user"."name" FROM "User" AS "user" WHERE "user"."id" = "order"."userId")
)
WHERE "order"."customerName" IS NULL;

UPDATE "PaymentRecord" AS "payment"
SET
  "customerName" = COALESCE(
    "payment"."customerName",
    (SELECT "user"."name" FROM "User" AS "user" WHERE "user"."id" = "payment"."userId"),
    (SELECT "order"."customerName" FROM "CommerceOrder" AS "order" WHERE "order"."id" = "payment"."commerceOrderId")
  ),
  "customerEmail" = COALESCE(
    "payment"."customerEmail",
    (SELECT "user"."email" FROM "User" AS "user" WHERE "user"."id" = "payment"."userId"),
    (SELECT "order"."customerEmail" FROM "CommerceOrder" AS "order" WHERE "order"."id" = "payment"."commerceOrderId")
  )
WHERE "payment"."customerName" IS NULL OR "payment"."customerEmail" IS NULL;
