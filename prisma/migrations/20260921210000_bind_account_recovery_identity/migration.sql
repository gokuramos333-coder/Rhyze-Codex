-- Bind existing links to the current identity before enabling email edits.
-- New issuance always writes these snapshots; null/unbound records fail closed.
ALTER TABLE "PasswordResetToken" ADD COLUMN "emailSnapshot" TEXT, ADD COLUMN "credentialFingerprint" TEXT;
ALTER TABLE "AccountClaimToken" ADD COLUMN "emailSnapshot" TEXT, ADD COLUMN "credentialFingerprint" TEXT;

UPDATE "PasswordResetToken" AS token SET
  "emailSnapshot" = account."email",
  "credentialFingerprint" = encode(sha256(convert_to(
    COALESCE(account."passwordHash", '') || ':' ||
    COALESCE(to_char(account."credentialsUpdatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '') || ':' ||
    account."role"::text || ':' || account."status"::text,
    'UTF8')), 'hex')
FROM "User" AS account WHERE account."id" = token."userId"
  AND (account."credentialsUpdatedAt" IS NULL OR token."createdAt" >= account."credentialsUpdatedAt");

UPDATE "AccountClaimToken" AS token SET
  "emailSnapshot" = account."email",
  "credentialFingerprint" = encode(sha256(convert_to(
    COALESCE(account."passwordHash", '') || ':' ||
    COALESCE(to_char(account."credentialsUpdatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), '') || ':' ||
    account."role"::text || ':' || account."status"::text,
    'UTF8')), 'hex')
FROM "User" AS account WHERE account."id" = token."userId"
  AND (account."credentialsUpdatedAt" IS NULL OR token."createdAt" >= account."credentialsUpdatedAt");
