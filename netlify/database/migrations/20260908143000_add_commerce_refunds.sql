CREATE TABLE "CommerceRefund" (
    "id" TEXT NOT NULL,
    "commerceOrderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "stripeRefundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceRefund_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommerceRefund_stripeRefundId_key" ON "CommerceRefund"("stripeRefundId");
CREATE INDEX "CommerceRefund_commerceOrderId_createdAt_idx" ON "CommerceRefund"("commerceOrderId", "createdAt");
CREATE INDEX "CommerceRefund_createdAt_idx" ON "CommerceRefund"("createdAt");

ALTER TABLE "CommerceRefund"
ADD CONSTRAINT "CommerceRefund_commerceOrderId_fkey"
FOREIGN KEY ("commerceOrderId") REFERENCES "CommerceOrder"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "CommerceRefund" (
    "id",
    "commerceOrderId",
    "amountCents",
    "reason",
    "createdAt"
)
SELECT
    'legacy_' || "id",
    "id",
    "refundedAmountCents",
    'Historical commerce refund backfill',
    "updatedAt"
FROM "CommerceOrder"
WHERE "refundedAmountCents" > 0
ON CONFLICT ("id") DO NOTHING;
