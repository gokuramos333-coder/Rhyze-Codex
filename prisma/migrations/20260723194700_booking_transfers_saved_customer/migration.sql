CREATE TYPE "TransferStatus" AS ENUM ('COMPLETED', 'PAYMENT_FAILED', 'BLOCKED');

ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;

CREATE TABLE "BookingTransfer" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "fromOccurrenceId" TEXT NOT NULL,
    "toOccurrenceId" TEXT,
    "status" "TransferStatus" NOT NULL,
    "feeCents" INTEGER NOT NULL DEFAULT 0,
    "stripePaymentIntentId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BookingTransfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BookingTransfer_stripePaymentIntentId_key" ON "BookingTransfer"("stripePaymentIntentId");
CREATE INDEX "BookingTransfer_bookingId_createdAt_idx" ON "BookingTransfer"("bookingId", "createdAt");
CREATE INDEX "BookingTransfer_instructorId_createdAt_idx" ON "BookingTransfer"("instructorId", "createdAt");
CREATE INDEX "BookingTransfer_memberId_createdAt_idx" ON "BookingTransfer"("memberId", "createdAt");
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
