ALTER TABLE "CreditLedgerEntry"
ADD COLUMN "sourceReturnKey" TEXT;

CREATE UNIQUE INDEX "CreditLedgerEntry_sourceReturnKey_key"
ON "CreditLedgerEntry"("sourceReturnKey");
