-- Remove the anonymous pending order created by the pre-launch Stripe smoke test.
DELETE FROM "CommerceOrder"
WHERE "id" = 'cms7493vq0000jo0alv5du157'
  AND "status" = 'PENDING'
  AND "customerEmail" IS NULL;
