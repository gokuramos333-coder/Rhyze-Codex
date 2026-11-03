-- Keep the original logging timestamp. Historical contact times are unknown; do not backfill.
ALTER TABLE "CustomerOutreach" ADD COLUMN "contactedAt" TIMESTAMP(3);
