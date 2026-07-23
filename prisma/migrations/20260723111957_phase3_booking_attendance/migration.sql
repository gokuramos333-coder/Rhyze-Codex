-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'LATE_CANCELLED', 'ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'PROMOTED', 'LEFT', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('CHECKED_IN', 'ATTENDED', 'NO_SHOW', 'LATE_CANCELLED');

-- CreateEnum
CREATE TYPE "CreditEntryType" AS ENUM ('GRANT', 'RESERVE', 'CONSUME', 'RELEASE', 'RESTORE', 'EXPIRE', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" TEXT NOT NULL DEFAULT 'MEMBER',
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "policySnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "promotedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "bookingId" TEXT,
    "userId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "checkedInAt" TIMESTAMP(3),
    "markedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isUnlimited" BOOLEAN NOT NULL DEFAULT false,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "bookingId" TEXT,
    "type" "CreditEntryType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booking_userId_status_bookedAt_idx" ON "Booking"("userId", "status", "bookedAt");

-- CreateIndex
CREATE INDEX "Booking_occurrenceId_status_idx" ON "Booking"("occurrenceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_occurrenceId_userId_key" ON "Booking"("occurrenceId", "userId");

-- CreateIndex
CREATE INDEX "WaitlistEntry_occurrenceId_status_joinedAt_idx" ON "WaitlistEntry"("occurrenceId", "status", "joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_occurrenceId_userId_key" ON "WaitlistEntry"("occurrenceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_bookingId_key" ON "AttendanceRecord"("bookingId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_occurrenceId_status_idx" ON "AttendanceRecord"("occurrenceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_occurrenceId_userId_key" ON "AttendanceRecord"("occurrenceId", "userId");

-- CreateIndex
CREATE INDEX "CreditAccount_userId_validUntil_idx" ON "CreditAccount"("userId", "validUntil");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_creditAccountId_createdAt_idx" ON "CreditLedgerEntry"("creditAccountId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_bookingId_idx" ON "CreditLedgerEntry"("bookingId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ClassOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ClassOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ClassOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_creditAccountId_fkey" FOREIGN KEY ("creditAccountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
