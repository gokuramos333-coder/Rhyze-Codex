CREATE TYPE "MembershipChangeRequestType" AS ENUM ('CHANGE', 'CANCEL');
CREATE TYPE "MembershipChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

CREATE TABLE "MembershipChangeRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "type" "MembershipChangeRequestType" NOT NULL,
  "requestedProductId" TEXT,
  "memberNote" TEXT,
  "status" "MembershipChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MembershipChangeRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MembershipChangeRequest_userId_status_createdAt_idx"
ON "MembershipChangeRequest"("userId", "status", "createdAt");
CREATE INDEX "MembershipChangeRequest_membershipId_status_idx"
ON "MembershipChangeRequest"("membershipId", "status");

ALTER TABLE "MembershipChangeRequest"
ADD CONSTRAINT "MembershipChangeRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MembershipChangeRequest"
ADD CONSTRAINT "MembershipChangeRequest_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MembershipChangeRequest"
ADD CONSTRAINT "MembershipChangeRequest_requestedProductId_fkey"
FOREIGN KEY ("requestedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MembershipChangeRequest"
ADD CONSTRAINT "MembershipChangeRequest_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
