ALTER TABLE "Membership" ADD COLUMN "planChangeState" JSONB;
ALTER TABLE "Membership" ADD COLUMN "billingLockToken" TEXT, ADD COLUMN "billingLockNeedsReview" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "PaymentRecord" ADD COLUMN "productName" TEXT;
CREATE TABLE "MembershipPlanChange" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "membershipId" TEXT NOT NULL REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "activeMembershipId" TEXT UNIQUE,
  "fromProductId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "toProductId" TEXT NOT NULL REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUOTED',
  "timing" TEXT NOT NULL,
  "effectiveAt" TIMESTAMP(3) NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "stripeSubscriptionId" TEXT NOT NULL,
  "stripeCustomerId" TEXT NOT NULL,
  "stripeItemId" TEXT NOT NULL,
  "fromPriceId" TEXT NOT NULL,
  "toPriceId" TEXT NOT NULL,
  "stripeScheduleId" TEXT UNIQUE,
  "stripeInvoiceId" TEXT,
  "quote" JSONB NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "MembershipPlanChange_membershipId_createdAt_idx" ON "MembershipPlanChange"("membershipId", "createdAt");
