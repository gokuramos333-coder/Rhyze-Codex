# Credential, Session, and Approval Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make credential expiration optional, persist login for one year, and notify both owners when an instructor application needs one-person approval.

**Architecture:** Nullable credential dates flow through validation, persistence, rendering, and reminder queries. Auth.js owns the one-year JWT cookie. Instructor application notifications are queued after account creation with recipient-specific deduplication.

**Tech Stack:** Next.js 14, TypeScript, Prisma/PostgreSQL, Auth.js, Vitest.

## Global Constraints

- Either Vanessa or Melissa may approve; only one approval is required.
- Approval notifications go to `vanessa@rhyzefit.com` and `melissa@rhyzefit.com`.
- Instructor applicants remain Members until approval.
- Credential files remain mandatory; expiration dates are optional.

---

### Task 1: Optional credential expiration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260723_optional_credential_expiration/migration.sql`
- Modify: `app/(portal)/instructor/profile/actions.ts`
- Modify: `app/(portal)/instructor/profile/page.tsx`
- Modify: `app/api/jobs/credentials/route.ts`
- Test: `tests/unit/credentials/credential-upload.test.ts`

**Interfaces:**
- Produces: `parseOptionalExpiration(value: FormDataEntryValue | null, now?: Date): Date | null`
- Consumes: nullable `InstructorCredential.expiresAt`.

- [ ] Write tests proving blank dates return `null`, future dates return a `Date`, and invalid/past dates fail.
- [ ] Run the focused test and confirm it fails before implementation.
- [ ] Make `expiresAt` nullable, add the SQL migration, implement the parser, and use it in the upload action.
- [ ] Update the profile cards to light orange with black text and render undated credentials safely.
- [ ] Exclude `expiresAt: null` from expiration-reminder queries.
- [ ] Run focused tests, Prisma validation, type checking, and commit.

### Task 2: One-year persistent session

**Files:**
- Modify: `auth.ts`
- Test: `tests/unit/auth/session-config.test.ts`

**Interfaces:**
- Produces: exported `AUTH_SESSION_MAX_AGE_SECONDS = 31_536_000`.

- [ ] Write a failing test asserting the one-year value.
- [ ] Export the constant and configure Auth.js `session.maxAge`.
- [ ] Run the focused test and commit.

### Task 3: Owner approval notifications

**Files:**
- Modify: `lib/domain/accounts/account-service.ts`
- Modify: `lib/domain/accounts/prisma-account-repository.ts`
- Modify: `app/(auth)/actions.ts`
- Create: `lib/domain/onboarding/instructor-approval-notifications.ts`
- Test: `tests/unit/onboarding/instructor-approval-notifications.test.ts`

**Interfaces:**
- Produces: `INSTRUCTOR_APPROVAL_RECIPIENTS` and `queueInstructorApprovalNotifications(client, application)`.
- Account creation returns `instructorApplicationId: string | null`.

- [ ] Write failing tests for exactly two recipients, admin link payload, and recipient-specific dedupe keys.
- [ ] Add the notification helper and return the application ID from account creation.
- [ ] Queue both emails only for pending instructor applications.
- [ ] Verify the existing approval action remains atomic: it updates only a `PENDING` application, making later attempts no-ops.
- [ ] Run focused and account tests, then commit.

### Task 4: Verification

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npx prisma validate`.
- [ ] Run `npm run build`.

