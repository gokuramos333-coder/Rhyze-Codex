CREATE TYPE "CommerceOrderKind" AS ENUM ('MERCHANDISE', 'EVENT');
CREATE TYPE "CommerceOrderStatus" AS ENUM ('PENDING', 'PAID', 'PAYMENT_FAILED', 'FULFILLMENT_REVIEW', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED');
CREATE TYPE "PaymentRecordKind" AS ENUM ('PRODUCT_PURCHASE', 'MEMBERSHIP_RENEWAL', 'MERCHANDISE', 'EVENT', 'TRANSFER_FEE');
CREATE TYPE "PaymentRecordStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'DISPUTED');

CREATE TABLE "CommerceOrder" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "occurrenceId" TEXT,
  "kind" "CommerceOrderKind" NOT NULL,
  "status" "CommerceOrderStatus" NOT NULL DEFAULT 'PENDING',
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "customerEmail" TEXT,
  "stripeCheckoutSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "paidAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommerceOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommerceOrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productReference" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "variant" TEXT,
  "imageUrl" TEXT,
  "unitAmountCents" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "CommerceOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "purchaseId" TEXT,
  "membershipId" TEXT,
  "commerceOrderId" TEXT,
  "kind" "PaymentRecordKind" NOT NULL,
  "status" "PaymentRecordStatus" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "stripeEventId" TEXT NOT NULL,
  "stripeCustomerId" TEXT,
  "stripeCheckoutSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "stripeInvoiceId" TEXT,
  "stripeSubscriptionId" TEXT,
  "receiptUrl" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommerceOrder_stripeCheckoutSessionId_key" ON "CommerceOrder"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "CommerceOrder_stripePaymentIntentId_key" ON "CommerceOrder"("stripePaymentIntentId");
CREATE INDEX "CommerceOrder_status_createdAt_idx" ON "CommerceOrder"("status", "createdAt");
CREATE INDEX "CommerceOrder_userId_createdAt_idx" ON "CommerceOrder"("userId", "createdAt");
CREATE INDEX "CommerceOrder_occurrenceId_status_idx" ON "CommerceOrder"("occurrenceId", "status");
CREATE INDEX "CommerceOrderItem_orderId_idx" ON "CommerceOrderItem"("orderId");
CREATE UNIQUE INDEX "PaymentRecord_stripeEventId_key" ON "PaymentRecord"("stripeEventId");
CREATE UNIQUE INDEX "PaymentRecord_stripeCheckoutSessionId_key" ON "PaymentRecord"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX "PaymentRecord_stripePaymentIntentId_key" ON "PaymentRecord"("stripePaymentIntentId");
CREATE UNIQUE INDEX "PaymentRecord_stripeInvoiceId_key" ON "PaymentRecord"("stripeInvoiceId");
CREATE INDEX "PaymentRecord_status_occurredAt_idx" ON "PaymentRecord"("status", "occurredAt");
CREATE INDEX "PaymentRecord_userId_occurredAt_idx" ON "PaymentRecord"("userId", "occurredAt");
CREATE INDEX "PaymentRecord_stripeSubscriptionId_occurredAt_idx" ON "PaymentRecord"("stripeSubscriptionId", "occurredAt");

ALTER TABLE "CommerceOrder" ADD CONSTRAINT "CommerceOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CommerceOrder" ADD CONSTRAINT "CommerceOrder_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "ClassOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommerceOrderItem" ADD CONSTRAINT "CommerceOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommerceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_commerceOrderId_fkey" FOREIGN KEY ("commerceOrderId") REFERENCES "CommerceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
