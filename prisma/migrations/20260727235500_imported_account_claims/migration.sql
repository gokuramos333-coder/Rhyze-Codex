CREATE TABLE "AccountClaimToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountClaimToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountClaimToken_tokenHash_key"
ON "AccountClaimToken"("tokenHash");

CREATE INDEX "AccountClaimToken_userId_expiresAt_idx"
ON "AccountClaimToken"("userId", "expiresAt");

ALTER TABLE "AccountClaimToken"
ADD CONSTRAINT "AccountClaimToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
