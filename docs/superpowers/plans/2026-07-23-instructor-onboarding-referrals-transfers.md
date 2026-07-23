# Instructor Onboarding, Referrals, and Transfers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build secure pending instructor onboarding, scoped instructor operations, private credential tracking, one-lifetime-use referrals and commissions, and policy-compliant booking transfers.

**Architecture:** Extend the existing Prisma/Auth.js platform with focused domain services for onboarding, referrals, credentials, and transfers. Server actions remain thin adapters around tested services; every instructor query includes an assigned-instructor predicate and all money-moving operations are webhook-idempotent.

**Tech Stack:** Next.js 14 App Router, TypeScript, PostgreSQL, Prisma, Auth.js, Stripe Node, Vitest, Tailwind CSS.

## Global Constraints

- Instructor access code is `RZTRIBE2026` and creates only a pending application.
- Password minimum is nine characters with uppercase, number, and symbol.
- Each member may redeem any discount code once in their lifetime.
- Referral discount is 5% on the first successful eligible purchase.
- Commission is $5 for a single class or $20 for a membership, once per referred customer.
- Instructor access is restricted to their assigned occurrences and own referral/document data.
- Transfers are free before six hours, cost $10 from six to two hours, and are blocked at two hours or less.
- VIP Access transfer fees are waived.
- Credential reminders run 48 hours after approval and 30, 7, and 1 day before expiration.

---

### Task 1: Signup validation and pending instructor applications

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/domain/onboarding/instructor-application.ts`
- Modify: `lib/validation/auth.ts`
- Modify: `lib/auth/password.ts`
- Modify: `lib/domain/accounts/account-service.ts`
- Modify: `lib/domain/accounts/prisma-account-repository.ts`
- Modify: `app/(auth)/actions.ts`
- Create: `components/domain/accounts/SignUpForm.tsx`
- Modify: `app/(auth)/sign-up/page.tsx`
- Test: `tests/unit/onboarding/instructor-application.test.ts`
- Test: `tests/unit/auth/password.test.ts`
- Test: `tests/unit/auth/validation.test.ts`

**Interfaces:**
- Produces `classifyInstructorCode(code: string | null): "NONE" | "PENDING" | "INVALID"`.
- Extends `NewAccountInput` with `phone`, `referralCode`, and `instructorCode`.
- Creates `InstructorApplication` with `PENDING` status without changing the user role.

- [ ] Write failing tests proving nine-character password acceptance, phone validation, correct pending-code classification, and invalid-code rejection.
- [ ] Run `npm test -- --run tests/unit/auth/password.test.ts tests/unit/auth/validation.test.ts tests/unit/onboarding/instructor-application.test.ts` and confirm failures reflect missing behavior.
- [ ] Add Prisma application/status models and member phone persistence, then create and apply migration `instructor_onboarding_referrals`.
- [ ] Implement server validation and account creation transaction.
- [ ] Build accessible client signup form with show/hide password buttons and optional instructor/referral code fields.
- [ ] Run focused tests, `npm run typecheck`, and `npm run lint`.
- [ ] Commit `feat: add pending instructor signup`.

### Task 2: Role-aware login and admin approval

**Files:**
- Create: `app/(auth)/continue/page.tsx`
- Modify: `app/(auth)/actions.ts`
- Create: `app/(studio)/admin/instructors/actions.ts`
- Create: `app/(studio)/admin/instructors/page.tsx`
- Modify: `app/(studio)/admin/layout.tsx`
- Create: `lib/domain/onboarding/referral-code.ts`
- Test: `tests/unit/onboarding/referral-code.test.ts`
- Test: `tests/unit/auth/authorization.test.ts`

**Interfaces:**
- Produces `generateReferralCode(name: string, existing: string[]): string`.
- Approval changes role to `INSTRUCTOR`, creates `InstructorProfile`, activates one `ReferralCode`, and queues approval/document reminders.

- [ ] Write failing tests for role destinations and deterministic collision-safe referral codes.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement `/continue` using `requireActiveUser()` and `dashboardPathForRole()`.
- [ ] Add admin pending-instructor page with approve/reject actions and audit records.
- [ ] Implement approval transaction and notification queue entries.
- [ ] Run focused tests, typecheck, and lint.
- [ ] Commit `feat: add instructor approval and role routing`.

### Task 3: Member photos and instructor credential records

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/storage/object-storage.ts`
- Create: `lib/domain/credentials/credential-rules.ts`
- Modify: `app/(portal)/member/profile/page.tsx`
- Modify: `app/(portal)/member/actions.ts`
- Modify: `app/(portal)/instructor/profile/page.tsx`
- Create: `app/(portal)/instructor/profile/actions.ts`
- Create: `app/(studio)/admin/instructors/[userId]/page.tsx`
- Create: `app/(studio)/admin/instructors/[userId]/actions.ts`
- Test: `tests/unit/credentials/credential-rules.test.ts`

**Interfaces:**
- Produces `credentialReminderDates(approvedAt, expiresAt)` and `validateUpload(file)`.
- Storage adapter exposes `putPublicImage`, `putPrivateDocument`, `deleteObject`, and `getSignedDownloadUrl`.

- [ ] Write failing tests for upload type/size policy and reminder dates.
- [ ] Run tests and confirm failures.
- [ ] Add profile-photo and instructor-credential models plus migration.
- [ ] Implement local-development storage under ignored `storage/` and an S3-compatible production adapter contract.
- [ ] Add member photo upload/replace/remove interface.
- [ ] Add instructor insurance/CPR upload with expiration dates.
- [ ] Add admin review/approve/reject interface and signed document downloads.
- [ ] Run tests, typecheck, lint, and upload authorization checks.
- [ ] Commit `feat: add secure profile and credential uploads`.

### Task 4: Credential reminder jobs

**Files:**
- Create: `lib/domain/credentials/reminder-service.ts`
- Create: `app/api/jobs/credentials/route.ts`
- Modify: `app/(studio)/admin/instructors/page.tsx`
- Test: `tests/unit/credentials/reminder-service.test.ts`

**Interfaces:**
- Produces idempotent email and in-app notification records keyed by credential/reminder date.

- [ ] Write failing tests for missing-after-48-hours and 30/7/1-day expiration scheduling.
- [ ] Implement idempotent reminder selection and queueing.
- [ ] Add admin compliance counts and filters.
- [ ] Run focused and full tests.
- [ ] Commit `feat: add credential compliance reminders`.

### Task 5: Referral attribution and lifetime redemption

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/domain/referrals/referral-service.ts`
- Modify: `app/(auth)/actions.ts`
- Modify: `app/(portal)/member/membership/actions.ts`
- Modify: `app/api/stripe/webhook/route.ts`
- Create: `app/(portal)/instructor/referrals/page.tsx`
- Modify: `app/(portal)/instructor/layout.tsx`
- Test: `tests/unit/referrals/referral-service.test.ts`

**Interfaces:**
- Produces `quoteReferralDiscount({ user, code, product }): 5-percent quote | rejection`.
- Stripe fulfillment atomically creates one `DiscountRedemption` and one `ReferralCommission`.

- [ ] Write failing tests for inactive codes, one lifetime redemption, 5% integer-cent calculations, $5/$20 commission selection, idempotency, and refunded reversal.
- [ ] Add referral, attribution, redemption, and commission models with unique database constraints.
- [ ] Persist valid signup attribution without consuming redemption.
- [ ] Apply referral quote to Checkout metadata and Stripe line-item discount amount.
- [ ] Fulfill redemption/commission only after successful payment webhook.
- [ ] Reverse commission when a purchase is refunded.
- [ ] Run focused tests, typecheck, lint, and Prisma validation.
- [ ] Commit `feat: add one-time referrals and commissions`.

### Task 6: Instructor referral dashboard

**Files:**
- Modify: `app/(portal)/instructor/page.tsx`
- Create: `components/referrals/ReferralCodeCard.tsx`
- Create: `components/referrals/EarningsSummary.tsx`
- Modify: `app/(portal)/instructor/referrals/page.tsx`
- Test: `tests/unit/referrals/earnings-periods.test.ts`

**Interfaces:**
- Produces weekly, monthly, yearly, and lifetime commission aggregates scoped by instructor ID.

- [ ] Write failing aggregation-boundary tests.
- [ ] Implement scoped referral/commission queries.
- [ ] Add Copy Code and Copy Referral Link client controls with confirmation.
- [ ] Add referred-customer ledger and period filters.
- [ ] Run tests, typecheck, lint, and authenticated browser check.
- [ ] Commit `feat: add instructor referral earnings dashboard`.

### Task 7: Transfer policy and automatic fee

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/domain/transfers/transfer-policy.ts`
- Create: `lib/domain/transfers/transfer-service.ts`
- Create: `app/(portal)/instructor/classes/[occurrenceId]/transfers/actions.ts`
- Create: `app/(portal)/instructor/classes/[occurrenceId]/transfers/page.tsx`
- Modify: `components/attendance/Roster.tsx`
- Test: `tests/unit/transfers/transfer-policy.test.ts`
- Test: `tests/integration/transfers/transfer-service.test.ts`

**Interfaces:**
- Produces `evaluateTransferWindow(originalStart, requestedAt, isVip)` returning `FREE`, `FEE_1000`, or `BLOCKED`.
- Transfer service validates instructor ownership, destination eligibility/capacity/overlap, charges Stripe before mutation when required, and atomically moves the booking.

- [ ] Write failing window, VIP, capacity, overlap, payment-failure, and atomicity tests.
- [ ] Add transfer/payment-attempt models and migration.
- [ ] Implement Stripe off-session PaymentIntent with idempotency key.
- [ ] Implement locked transaction that preserves the original booking unless the full transfer succeeds.
- [ ] Build destination selector restricted to the next 14 days.
- [ ] Run focused/full tests, typecheck, lint, and Prisma validation.
- [ ] Commit `feat: add policy compliant booking transfers`.

### Task 8: Instructor class messages and emergency cancellation

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/domain/class-messages/class-message-service.ts`
- Create: `app/(portal)/instructor/classes/[occurrenceId]/message/page.tsx`
- Create: `app/(portal)/instructor/classes/[occurrenceId]/message/actions.ts`
- Modify: `app/(portal)/instructor/classes/[occurrenceId]/roster/page.tsx`
- Create: `app/(portal)/member/notifications/page.tsx`
- Modify: `app/(portal)/member/layout.tsx`
- Test: `tests/unit/class-messages/class-message-service.test.ts`

**Interfaces:**
- Service accepts only assigned instructor + occurrence and targets confirmed bookings only.
- Emergency cancellation records reason, cancels occurrence, restores eligible credits, and queues email/in-app notices.

- [ ] Write failing authorization, recipient-selection, cancellation, and idempotency tests.
- [ ] Add in-app notification and class-message models.
- [ ] Implement assigned-occurrence messaging and cancellation transactions.
- [ ] Add instructor forms and member notification inbox.
- [ ] Run focused/full tests and browser authorization checks.
- [ ] Commit `feat: add scoped instructor class communications`.

### Task 9: Full verification and production checklist

**Files:**
- Modify: `.env.example`
- Modify: `docs/plans/2026-07-23-rhyze-studio-platform.md`
- Create: `docs/operations/instructor-referrals-transfers.md`

**Interfaces:**
- Documents Stripe saved-method requirements, object storage variables, job endpoints, instructor approval, credential review, refund reversal, and emergency cancellation.

- [ ] Seed pending and approved instructor fixtures without production credentials.
- [ ] Run `npm test`, legacy `node --test` suites, `npm run typecheck`, `npm run lint`, `npm run prisma:validate`, and `npm run build`.
- [ ] Restart development server after moving the production `.next` cache aside.
- [ ] Browser-test signup, approval, role routing, profile upload, referral copy, scoped roster, transfer, and class message flows.
- [ ] Confirm unauthenticated and cross-instructor access is denied.
- [ ] Commit `docs: add instructor operations runbook`.
