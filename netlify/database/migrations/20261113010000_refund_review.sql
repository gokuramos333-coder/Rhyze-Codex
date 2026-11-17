-- Additive, bounded financial operations. Existing histories are never rewritten.
CREATE TABLE "FinancialReview" (
  id text PRIMARY KEY,
  "paymentRecordId" text NOT NULL REFERENCES "PaymentRecord"(id),
  "bookingId" text REFERENCES "Booking"(id),
  reason text NOT NULL,
  basis jsonb,
  "requesterId" text,
  version integer NOT NULL DEFAULT 1,
  urgent boolean NOT NULL DEFAULT true,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "resolvedAt" timestamptz,
  UNIQUE ("paymentRecordId", reason)
);
CREATE TABLE "ApprovedFinancialOperation" (
  id text PRIMARY KEY,
  "paymentRecordId" text NOT NULL REFERENCES "PaymentRecord"(id),
  "reviewId" text REFERENCES "FinancialReview"(id),
  kind text NOT NULL CHECK (kind IN ('REFUND','REPLACEMENT')),
  "actorId" text NOT NULL REFERENCES "User"(id),
  reason text NOT NULL,
  "authorizationReference" text NOT NULL,
  "approvedAt" timestamptz NOT NULL DEFAULT now(),
  "amountCents" integer NOT NULL CHECK ("amountCents" > 0),
  currency text NOT NULL CHECK (currency = 'usd'),
  payload jsonb NOT NULL,
  "payloadHash" text NOT NULL,
  "providerKey" text NOT NULL UNIQUE,
  state text NOT NULL CHECK (state IN ('RESERVED','UNKNOWN','PENDING','FAILED','SUCCEEDED')),
  "providerId" text UNIQUE,
  receipt jsonb,
  "settledAt" timestamptz,
  UNIQUE ("paymentRecordId", kind)
);
CREATE TABLE "AttendanceCollection" (
  "bookingId" text PRIMARY KEY REFERENCES "Booking"(id),
  "operationKey" text NOT NULL UNIQUE,
  "serviceConfirmed" boolean NOT NULL DEFAULT false,
  state text NOT NULL CHECK (state IN ('RESERVED','UNKNOWN','SUCCEEDED','FAILED')),
  "paymentIntentId" text,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "FinancialReview_open" ON "FinancialReview" ("createdAt") WHERE "resolvedAt" IS NULL;
-- Immutable authorization and payload: reconciliation may only change receipt/state.
CREATE FUNCTION protect_financial_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW) - ARRAY['state','providerId','receipt','settledAt']) IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['state','providerId','receipt','settledAt']) THEN
   RAISE EXCEPTION 'Financial approval is immutable';
 END IF;
 IF OLD.state = 'SUCCEEDED' AND NEW.state <> 'SUCCEEDED' THEN
   RAISE EXCEPTION 'A settled operation cannot be reopened';
 END IF;
 IF OLD."providerId" IS NOT NULL AND NEW."providerId" IS DISTINCT FROM OLD."providerId" THEN
   RAISE EXCEPTION 'Provider identity is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "FinancialApprovalImmutable" BEFORE UPDATE ON "ApprovedFinancialOperation"
FOR EACH ROW EXECUTE FUNCTION protect_financial_approval();

-- Durable jointly assigned tasks; reading/dismissing a notification never closes debt.
CREATE TABLE "FinancialTask" (
  id text PRIMARY KEY,
  "reviewId" text REFERENCES "FinancialReview"(id),
  "bookingId" text REFERENCES "Booking"(id),
  assignees jsonb NOT NULL CHECK (jsonb_array_length(assignees)=2),
  "identityEvidence" text NOT NULL,
  "dueAt" timestamptz NOT NULL,
  "escalatedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls("reviewId","bookingId")=1)
);
CREATE INDEX "FinancialTask_due" ON "FinancialTask" ("dueAt",id) WHERE "escalatedAt" IS NULL;
CREATE INDEX "FinancialReview_page" ON "FinancialReview" ("createdAt",id) WHERE "resolvedAt" IS NULL;
