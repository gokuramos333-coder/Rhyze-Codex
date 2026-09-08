ALTER TABLE "CreditLedgerEntry"
ADD COLUMN "sourceStripeInvoiceId" TEXT;

CREATE UNIQUE INDEX "CreditLedgerEntry_sourceStripeInvoiceId_key"
ON "CreditLedgerEntry"("sourceStripeInvoiceId");
