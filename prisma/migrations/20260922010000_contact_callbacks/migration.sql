-- Additive only: contact callbacks do not change class bookings or memberships.
CREATE TABLE "CallbackRequest" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "clientHash" TEXT,
    "emailMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallbackRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CallbackRequest_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CallbackRequest_requestKey_key" ON "CallbackRequest"("requestKey");
CREATE UNIQUE INDEX "CallbackRequest_startAt_key" ON "CallbackRequest"("startAt");
CREATE UNIQUE INDEX "CallbackRequest_emailMessageId_key" ON "CallbackRequest"("emailMessageId");
CREATE INDEX "CallbackRequest_email_createdAt_idx" ON "CallbackRequest"("email", "createdAt");
CREATE INDEX "CallbackRequest_clientHash_createdAt_idx" ON "CallbackRequest"("clientHash", "createdAt");
