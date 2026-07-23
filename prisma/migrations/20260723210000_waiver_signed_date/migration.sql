ALTER TABLE "WaiverAcceptance" ADD COLUMN "signedDate" TIMESTAMP(3);
UPDATE "WaiverAcceptance" SET "signedDate" = "acceptedAt";
ALTER TABLE "WaiverAcceptance" ALTER COLUMN "signedDate" SET NOT NULL;
