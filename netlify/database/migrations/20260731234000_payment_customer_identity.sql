ALTER TABLE "CommerceOrder"
ADD COLUMN "customerName" TEXT;

ALTER TABLE "PaymentRecord"
ADD COLUMN "customerName" TEXT,
ADD COLUMN "customerEmail" TEXT;
