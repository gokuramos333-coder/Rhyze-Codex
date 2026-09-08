ALTER TYPE "PaymentRecordKind" ADD VALUE IF NOT EXISTS 'LATE_CANCELLATION_FEE';
ALTER TYPE "PaymentRecordKind" ADD VALUE IF NOT EXISTS 'NO_SHOW_FEE';

ALTER TABLE "Purchase"
ADD COLUMN "policyAcceptedAt" TIMESTAMP(3),
ADD COLUMN "policyAcceptance" JSONB;

ALTER TABLE "PaymentRecord"
ADD COLUMN "bookingId" TEXT;

ALTER TABLE "PaymentRecord"
ADD CONSTRAINT "PaymentRecord_bookingId_fkey"
FOREIGN KEY ("bookingId") REFERENCES "Booking"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PaymentRecord_bookingId_occurredAt_idx"
ON "PaymentRecord"("bookingId", "occurredAt");
