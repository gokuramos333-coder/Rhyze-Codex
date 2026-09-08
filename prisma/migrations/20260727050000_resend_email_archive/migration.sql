ALTER TYPE "EmailStatus" ADD VALUE IF NOT EXISTS 'RECEIVED';

CREATE TYPE "EmailDirection" AS ENUM ('OUTBOUND', 'INBOUND');

ALTER TABLE "EmailMessage"
ADD COLUMN "direction" "EmailDirection" NOT NULL DEFAULT 'OUTBOUND',
ADD COLUMN "from" TEXT,
ADD COLUMN "toList" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "cc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "bcc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "replyTo" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "textBody" TEXT,
ADD COLUMN "htmlBody" TEXT,
ADD COLUMN "headers" JSONB,
ADD COLUMN "messageId" TEXT,
ADD COLUMN "threadId" TEXT,
ADD COLUMN "receivedAt" TIMESTAMP(3);

UPDATE "EmailMessage"
SET "toList" = ARRAY["to"], "threadId" = "id"
WHERE cardinality("toList") = 0;

CREATE UNIQUE INDEX "EmailMessage_providerId_key" ON "EmailMessage"("providerId");
CREATE INDEX "EmailMessage_direction_createdAt_idx" ON "EmailMessage"("direction", "createdAt");
CREATE INDEX "EmailMessage_threadId_createdAt_idx" ON "EmailMessage"("threadId", "createdAt");

CREATE TABLE "EmailAttachment" (
  "id" TEXT NOT NULL,
  "emailMessageId" TEXT NOT NULL,
  "resendAttachmentId" TEXT,
  "filename" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "contentDisposition" TEXT,
  "contentId" TEXT,
  "size" INTEGER NOT NULL,
  "content" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailAttachment_emailMessageId_resendAttachmentId_key"
ON "EmailAttachment"("emailMessageId", "resendAttachmentId");
CREATE INDEX "EmailAttachment_emailMessageId_createdAt_idx"
ON "EmailAttachment"("emailMessageId", "createdAt");
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_emailMessageId_fkey"
FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ResendWebhookEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "resendEmailId" TEXT,
  "payload" JSONB NOT NULL,
  "processingAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResendWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResendWebhookEvent_type_createdAt_idx" ON "ResendWebhookEvent"("type", "createdAt");
CREATE INDEX "ResendWebhookEvent_resendEmailId_createdAt_idx" ON "ResendWebhookEvent"("resendEmailId", "createdAt");
