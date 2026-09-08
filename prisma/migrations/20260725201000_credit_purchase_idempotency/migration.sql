ALTER TABLE "CreditAccount" ADD COLUMN "sourcePurchaseId" TEXT;
CREATE UNIQUE INDEX "CreditAccount_sourcePurchaseId_key" ON "CreditAccount"("sourcePurchaseId");
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_sourcePurchaseId_fkey" FOREIGN KEY ("sourcePurchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
