# Launch Account Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let imported Somble members securely activate their existing Rhyze account, recover a forgotten password, and change a password from Profile without creating duplicate users or losing imported data.

**Architecture:** Imported `INVITED` users receive a dedicated, hashed, single-use account-claim token valid for 30 days. Existing `ACTIVE` users retain the separate one-hour password-reset flow. A small account-security domain service owns logged-in password changes, while server actions provide authorization, redirects, email queueing, and audit context.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma/PostgreSQL, Auth.js, Argon2, Vitest, Resend-backed email queue.

## Global Constraints

- Keep all existing Somble memberships, credits, bookings, purchases, rosters, and profile data attached to the original `User.id`.
- Never create a shared/default password for imported users.
- Account activation links expire after one month; normal forgot-password links expire after one hour.
- Passwords require at least 9 characters, an uppercase letter, a number, and a symbol.
- Logged-in password changes require the current password and keep the current session active.
- Do not deploy to Netlify and do not send real activation emails during implementation or rehearsal.
- Invitation tooling is dry-run by default and requires an explicit `--apply` flag to enqueue messages.

---

### Task 1: Add One-Month Imported Account Claims

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260727235500_imported_account_claims/migration.sql`
- Create: `netlify/database/migrations/20260727235500_imported_account_claims.sql`
- Create: `lib/domain/accounts/account-claim-service.ts`
- Create: `lib/domain/accounts/prisma-account-claim-repository.ts`
- Test: `tests/unit/accounts/account-claim-service.test.ts`

**Interfaces:**
- Produces: `issueAccountClaim(userId: string, repository: AccountClaimRepository, now?: Date): Promise<{ rawToken: string; expiresAt: Date }>`
- Produces: `claimImportedAccount(rawToken: string, password: string, repository: AccountClaimRepository, now?: Date): Promise<{ userId: string; email: string }>`

- [ ] **Step 1: Write failing claim service tests**

Test a 30-day expiry, SHA-256-only token persistence, `INVITED` eligibility, no duplicate user creation, activation of the existing user, expired tokens, unknown tokens, and one-use enforcement.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run tests/unit/accounts/account-claim-service.test.ts`

Expected: FAIL because the claim service does not exist.

- [ ] **Step 3: Implement the minimal domain service and repository**

Use `createSecureToken()`, `hashToken()`, `isTokenUsable()`, `validatePassword()`, and `hashPassword()`. The repository transaction updates the same `User` row to `ACTIVE`, writes `passwordHash`, consumes the token, and records `account.claimed` in `AuditLog`.

- [ ] **Step 4: Add mirrored Prisma and Netlify migrations**

Create `AccountClaimToken(id, userId, tokenHash, expiresAt, usedAt, createdAt)` with a unique token hash, indexed user/expiry fields, and cascading user deletion.

- [ ] **Step 5: Verify GREEN and Prisma validity**

Run: `npx vitest run tests/unit/accounts/account-claim-service.test.ts && npm run prisma:validate && npm run prisma:generate`

### Task 2: Add the Branded Claim Page and Approved Migration Email

**Files:**
- Create: `app/(auth)/claim-account/[token]/page.tsx`
- Create: `app/(auth)/claim-account/actions.ts`
- Modify: `lib/notifications/email-templates.ts`
- Modify: `tests/unit/notifications/email-templates.test.ts`
- Create: `tests/unit/accounts/account-claim-surface.test.ts`

**Interfaces:**
- Consumes: `claimImportedAccount(...)` from Task 1.
- Produces: `/claim-account/[token]` and `ACCOUNT_ACTIVATION` email payload `{ name, activationUrl }`.

- [ ] **Step 1: Write failing surface and template tests**

Require the claim form to use two show/hide password fields and the current 9-character policy. Require `ACCOUNT_ACTIVATION` to explain the in-house platform upgrade, preserved account data, and one-month link expiry, with CTA `Activate My Rhyze Account`.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npx vitest run tests/unit/accounts/account-claim-surface.test.ts tests/unit/notifications/email-templates.test.ts`

- [ ] **Step 3: Implement the claim page, action, and template**

On success, redirect to `/sign-in?claimed=1`; do not automatically sign the user in. Invalid, expired, or consumed claims show a generic recovery path to `/forgot-password`.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run tests/unit/accounts/account-claim-service.test.ts tests/unit/accounts/account-claim-surface.test.ts tests/unit/notifications/email-templates.test.ts`

### Task 3: Harden Forgot Password

**Files:**
- Modify: `lib/domain/accounts/password-reset-service.ts`
- Modify: `lib/domain/accounts/prisma-password-reset-repository.ts`
- Modify: `app/(auth)/actions.ts`
- Modify: `app/(auth)/reset-password/[token]/page.tsx`
- Modify: `lib/notifications/email-templates.ts`
- Create: `tests/unit/accounts/password-reset-service.test.ts`
- Modify: `tests/unit/notifications/email-templates.test.ts`

**Interfaces:**
- Produces: one-hour, one-use reset links for `ACTIVE` users.
- Produces: throttled repeated requests without revealing whether an account exists.
- Produces: `PASSWORD_CHANGED` security confirmation.

- [ ] **Step 1: Write failing reset tests**

Require a one-hour expiry, no token for unknown/inactive users, a five-minute per-account issuance cooldown, strong-password enforcement, used-token rejection, and session revocation after a forgotten-password reset.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npx vitest run tests/unit/accounts/password-reset-service.test.ts`

- [ ] **Step 3: Implement reset throttling and session revocation**

Preserve the generic forgot-password response. The reset transaction updates the password, marks the token used, deletes that user's sessions, and records the audit event.

- [ ] **Step 4: Fix the reset form**

Use `PasswordField` for both password inputs and show the actual 9-character rule.

- [ ] **Step 5: Add and queue the password-changed email**

The confirmation contains no password or token and directs an unrecognized changer to contact Rhyze management.

- [ ] **Step 6: Verify GREEN**

Run: `npx vitest run tests/unit/accounts/password-reset-service.test.ts tests/unit/notifications/email-templates.test.ts`

### Task 4: Add Profile Account and Password Security

**Files:**
- Create: `lib/domain/accounts/password-change-service.ts`
- Modify: `app/(portal)/member/actions.ts`
- Modify: `app/(portal)/member/profile/page.tsx`
- Create: `tests/unit/accounts/password-change-service.test.ts`
- Create: `tests/unit/accounts/profile-security-surface.test.ts`

**Interfaces:**
- Produces: `changePassword(input, repository): Promise<void>` requiring current password and preserving the current session.

- [ ] **Step 1: Write failing password-change tests**

Require correct current password, matching confirmation, current 9-character policy, an updated Argon2 hash, and no session deletion.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npx vitest run tests/unit/accounts/password-change-service.test.ts tests/unit/accounts/profile-security-surface.test.ts`

- [ ] **Step 3: Implement the domain service and server action**

Authorize with `requireArea('member')`, load the user's hash, verify the current password, update the hash and audit log transactionally, keep the session active, and queue `PASSWORD_CHANGED`.

- [ ] **Step 4: Add the Profile Account & Security card**

Show the account email as read-only plus current password, new password, confirmation, and clear success/error feedback.

- [ ] **Step 5: Verify GREEN**

Run: `npx vitest run tests/unit/accounts/password-change-service.test.ts tests/unit/accounts/profile-security-surface.test.ts`

### Task 5: Add Safe Somble Invitation Operations

**Files:**
- Create: `scripts/send-somble-account-invites.ts`
- Modify: `package.json`
- Create: `docs/operations/somble-account-activation.md`
- Create: `tests/unit/accounts/somble-account-invites.test.ts`

**Interfaces:**
- Produces: `npm run somble:send-claims -- --dry-run`
- Produces: `npm run somble:send-claims -- --apply` only for the later approved cutover.

- [ ] **Step 1: Write failing dry-run behavior tests**

Require dry run by default, selection of imported `INVITED` members with email, exclusion/reporting of conflicts, no token/email writes in dry run, and one claim/email per eligible user in apply mode.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npx vitest run tests/unit/accounts/somble-account-invites.test.ts`

- [ ] **Step 3: Implement the testable batch service and CLI wrapper**

Queue `ACCOUNT_ACTIVATION` with a dedupe key tied to the claim token record. Print recipient, skipped, and conflict totals. Never log raw tokens.

- [ ] **Step 4: Document the rehearsal and send gates**

Document dry run, email-template approval, Resend configuration, one-member test, full reconciliation, and the explicit no-send/no-deploy rule.

- [ ] **Step 5: Verify GREEN without applying**

Run only: `npm run somble:send-claims -- --dry-run`

### Task 6: Full Verification

**Files:**
- Modify only files required by proven verification failures.

- [ ] **Step 1: Apply the new migration to the local development database**

Run: `npx prisma migrate deploy`

- [ ] **Step 2: Verify generated client and schema**

Run: `npm run prisma:generate && npm run prisma:validate`

- [ ] **Step 3: Run all required checks**

Run: `npm run typecheck && npm test && npm run build`

- [ ] **Step 4: Verify local browser flows**

Check `/forgot-password`, `/claim-account/[test-token]`, `/sign-in`, and `/member/profile` at `http://localhost:3001`. Confirm no real email is sent and no Netlify deployment occurs.

- [ ] **Step 5: Record remaining production gates**

List fresh final Somble export, production database backup, production environment verification, Stripe reconciliation, one-address activation test, batch invitation authorization, and DNS/domain switch as still pending until explicitly approved.
