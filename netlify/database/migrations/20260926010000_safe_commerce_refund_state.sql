ALTER TABLE "CommerceRefund"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'SUCCEEDED',
ADD COLUMN "providerStatus" TEXT,
ADD COLUMN "operationKey" TEXT,
ADD COLUMN "actorId" TEXT,
ADD COLUMN "verifiedAt" TIMESTAMP(3),
ADD COLUMN "failureReason" TEXT,
ADD COLUMN "bookingId" TEXT;

CREATE UNIQUE INDEX "CommerceRefund_operationKey_key" ON "CommerceRefund"("operationKey");
CREATE INDEX "CommerceRefund_status_createdAt_idx" ON "CommerceRefund"("status", "createdAt");
CREATE INDEX "CommerceRefund_bookingId_status_idx" ON "CommerceRefund"("bookingId", "status");
