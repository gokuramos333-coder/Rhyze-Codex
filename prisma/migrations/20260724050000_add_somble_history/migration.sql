CREATE TABLE "SombleClientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceStatus" TEXT NOT NULL,
    "lastWorkoutAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "sourceJoinedAt" TIMESTAMP(3) NOT NULL,
    "totalWorkouts" INTEGER NOT NULL DEFAULT 0,
    "appDownloaded" BOOLEAN NOT NULL DEFAULT false,
    "birthday" TIMESTAMP(3),
    "sourceFile" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SombleClientProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SombleTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "supporterName" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SombleTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SombleClientProfile_userId_key" ON "SombleClientProfile"("userId");
CREATE INDEX "SombleClientProfile_sourceStatus_idx" ON "SombleClientProfile"("sourceStatus");
CREATE INDEX "SombleClientProfile_sourceJoinedAt_idx" ON "SombleClientProfile"("sourceJoinedAt");
CREATE UNIQUE INDEX "SombleTransaction_transferId_key" ON "SombleTransaction"("transferId");
CREATE UNIQUE INDEX "SombleTransaction_paymentId_key" ON "SombleTransaction"("paymentId");
CREATE INDEX "SombleTransaction_transferredAt_idx" ON "SombleTransaction"("transferredAt");
CREATE INDEX "SombleTransaction_contentType_transferredAt_idx" ON "SombleTransaction"("contentType", "transferredAt");
CREATE INDEX "SombleTransaction_userId_transferredAt_idx" ON "SombleTransaction"("userId", "transferredAt");

ALTER TABLE "SombleClientProfile" ADD CONSTRAINT "SombleClientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SombleTransaction" ADD CONSTRAINT "SombleTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
