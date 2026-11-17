CREATE TABLE "FinancialRelease" (
 id text PRIMARY KEY CHECK (id='rhyze'),
 generation integer NOT NULL DEFAULT 0,
 "enabledDeployId" text,
 "sourceSha" text,
 "evidenceHash" text,
 "activatedBy" text,
 "activatedAt" timestamptz,
 CHECK (("enabledDeployId" IS NULL AND "sourceSha" IS NULL AND "evidenceHash" IS NULL AND "activatedAt" IS NULL) OR
   ("enabledDeployId" ~ '^[a-f0-9]{24}$' AND "sourceSha" ~ '^[a-f0-9]{40}$' AND "evidenceHash" ~ '^[a-f0-9]{64}$' AND "activatedBy" IS NOT NULL AND "activatedAt" IS NOT NULL))
);
INSERT INTO "FinancialRelease"(id) VALUES ('rhyze');
