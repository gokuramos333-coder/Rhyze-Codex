-- Additive only: existing members intentionally retain NULL attribution.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "source_label" TEXT,
  ADD COLUMN IF NOT EXISTS "source_fbclid" TEXT,
  ADD COLUMN IF NOT EXISTS "source_utm_source" TEXT,
  ADD COLUMN IF NOT EXISTS "source_utm_medium" TEXT,
  ADD COLUMN IF NOT EXISTS "source_utm_campaign" TEXT,
  ADD COLUMN IF NOT EXISTS "source_utm_term" TEXT,
  ADD COLUMN IF NOT EXISTS "source_utm_content" TEXT,
  ADD COLUMN IF NOT EXISTS "source_referrer" TEXT,
  ADD COLUMN IF NOT EXISTS "source_landing_path" TEXT,
  ADD COLUMN IF NOT EXISTS "source_captured_at" TIMESTAMP(3);
