-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CampaignStatus" ADD VALUE 'NEEDS_REVIEW';
ALTER TYPE "CampaignStatus" ADD VALUE 'PARTIALLY_SENT';
ALTER TYPE "CampaignStatus" ADD VALUE 'FAILED';

-- AlterTable
ALTER TABLE "EmailCampaign" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "approvedSnapshot" JSONB,
ADD COLUMN     "approvedVersion" INTEGER,
ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "audience" JSONB,
ADD COLUMN     "document" JSONB,
ADD COLUMN     "holdReason" TEXT,
ADD COLUMN     "leaseAt" TIMESTAMP(3),
ADD COLUMN     "scheduleMode" TEXT NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "sentSnapshot" JSONB,
ADD COLUMN     "targetWeek" TEXT,
ADD COLUMN     "templateType" TEXT NOT NULL DEFAULT 'LEGACY',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "CustomerLeadProfile" (
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL DEFAULT 'NOT_CONTACTED',
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "followUpAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "consent" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "consentSource" TEXT,
    "consentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerLeadProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CustomerOutreach" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorInitials" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "method" TEXT,
    "attempt" INTEGER,
    "outcome" TEXT,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operationKey" TEXT NOT NULL,

    CONSTRAINT "CustomerOutreach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "document" JSONB NOT NULL,
    "subject" TEXT NOT NULL,
    "previewText" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "membershipAtSend" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "exclusionReason" TEXT,
    "emailMessageId" TEXT,
    "token" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterEvent" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "link" TEXT,
    "automated" BOOLEAN,
    "detail" TEXT,

    CONSTRAINT "NewsletterEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingSuppression" (
    "email" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketingSuppression_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "NewsletterAsset" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterSettings" (
    "id" TEXT NOT NULL DEFAULT 'studio',
    "version" INTEGER NOT NULL DEFAULT 1,
    "replyTo" TEXT NOT NULL DEFAULT '',
    "postalAddress" TEXT NOT NULL DEFAULT 'The Shoppes at Lafayette, 75 NJ-15, Building J, Lafayette Township, NJ 07848',
    "googleReviewUrl" TEXT NOT NULL DEFAULT '',
    "engagementDays" INTEGER NOT NULL DEFAULT 30,
    "attributionDays" INTEGER NOT NULL DEFAULT 7,
    "opensSupported" BOOLEAN NOT NULL DEFAULT false,
    "clicksSupported" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerOutreach_operationKey_key" ON "CustomerOutreach"("operationKey");

-- CreateIndex
CREATE INDEX "CustomerOutreach_userId_occurredAt_idx" ON "CustomerOutreach"("userId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterRecipient_emailMessageId_key" ON "NewsletterRecipient"("emailMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterRecipient_token_key" ON "NewsletterRecipient"("token");

-- CreateIndex
CREATE INDEX "NewsletterRecipient_status_nextAttemptAt_idx" ON "NewsletterRecipient"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterRecipient_campaignId_email_key" ON "NewsletterRecipient"("campaignId", "email");

-- CreateIndex
CREATE INDEX "NewsletterEvent_recipientId_type_occurredAt_idx" ON "NewsletterEvent"("recipientId", "type", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterAsset_url_key" ON "NewsletterAsset"("url");

-- AddForeignKey
ALTER TABLE "CustomerLeadProfile" ADD CONSTRAINT "CustomerLeadProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLeadProfile" ADD CONSTRAINT "CustomerLeadProfile_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOutreach" ADD CONSTRAINT "CustomerOutreach_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerOutreach" ADD CONSTRAINT "CustomerOutreach_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterRecipient" ADD CONSTRAINT "NewsletterRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterRecipient" ADD CONSTRAINT "NewsletterRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterRecipient" ADD CONSTRAINT "NewsletterRecipient_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterEvent" ADD CONSTRAINT "NewsletterEvent_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "NewsletterRecipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
