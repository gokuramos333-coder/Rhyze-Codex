ALTER TABLE "Product"
ADD COLUMN "availabilityStart" TIMESTAMP(3),
ADD COLUMN "availabilityEnd" TIMESTAMP(3),
ADD COLUMN "alwaysAvailable" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ClassTemplate"
ADD COLUMN "isEvent" BOOLEAN NOT NULL DEFAULT false;
