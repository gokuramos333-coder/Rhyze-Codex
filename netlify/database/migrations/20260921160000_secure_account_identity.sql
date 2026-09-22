-- Fail closed if legacy case variants collide. Resolve duplicates explicitly;
-- never merge or rename accounts automatically in a schema migration.
CREATE UNIQUE INDEX "User_email_case_insensitive_key" ON "User" (lower(btrim("email")));
ALTER TABLE "User" ADD COLUMN "emailChangeRequestedAt" TIMESTAMP(3);

CREATE TABLE "AccountEmailChangeToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "oldEmail" TEXT NOT NULL,
  "newEmail" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "credentialFingerprint" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "status" "UserStatus" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountEmailChangeToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AccountEmailChangeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccountEmailChangeToken_tokenHash_key" ON "AccountEmailChangeToken"("tokenHash");
CREATE INDEX "AccountEmailChangeToken_userId_expiresAt_idx" ON "AccountEmailChangeToken"("userId", "expiresAt");

CREATE TABLE "AccountContactSync" (
  "userId" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountContactSync_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "AccountContactSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AccountContactSync_nextAttemptAt_idx" ON "AccountContactSync"("nextAttemptAt");
