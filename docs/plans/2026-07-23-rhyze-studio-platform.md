# Rhyze Fitness Studio Platform Implementation Plan

> **For agentic workers:** Implement one phase at a time. Use test-driven development for booking, credit, payment, waiver, and authorization rules. Stop for review after every phase.

**Goal:** Replace Somble with a Rhyze-owned studio management platform covering accounts, scheduling, booking, attendance, memberships, Stripe payments, email automation, dashboards, campaigns, and reports.

**Architecture:** Extend the existing Next.js App Router site as a modular monolith. Keep the public brand experience, add protected route groups for member, instructor, and staff workspaces, and put business rules in server-only domain services rather than page components. PostgreSQL is the source of truth; Prisma provides typed persistence; Auth.js provides database-backed sessions; Stripe owns payment method and subscription processing; Resend sends transactional email; Inngest runs durable background jobs and scheduled reminders.

**Tech stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, PostgreSQL, Prisma, Auth.js, Stripe, Resend, Inngest, Zod, Vitest, Testing Library, and Playwright.

## Current-State Audit

### Verified repository

- Active server: `/Users/gokuramos/Projects/rhyze-fitness-new` on branch `rhyze-2-new`.
- Framework: Next.js 14.2.15 App Router, React 18, strict TypeScript, Tailwind CSS.
- Current routes: public marketing pages plus `/dashboard`, `/signin`, `/join`, `/book/[slug]`, `/book/event/[slug]`, `/api/contact`, and `/api/newsletter`.
- Database/ORM: none.
- Authentication/session management: none.
- Payments: none.
- Background jobs/email delivery: none; contact and newsletter handlers only validate and log submissions.
- Current tests: Node test-runner source/content assertions. There are no domain, database, API integration, component-interaction, or browser tests.
- Current Studio OS: one long static dashboard page backed by hard-coded records in `lib/rhyze-platform.ts`; most controls open hard-coded detail modals and do not persist changes.
- Current member portal: `/signin` is a static preview, not a sign-in form or protected member page.
- Existing branding worth preserving: black/charcoal surfaces, cream typography, coral/orange/gold gradient, Bebas display type, compact uppercase labels, instructor imagery, and the existing public class/event/pricing content.
- UX issue to correct: the public header/footer surround the admin dashboard, the dashboard is an oversized single-page anchor layout, and information density/active navigation become difficult to scan. RHYZE #3 should use a dedicated app shell, section routes, responsive navigation, and consistent table/filter/action patterns.

### Source evidence

- `package.json:5-23` defines the current Next.js stack and contains no database, auth, payment, email, job, or test-framework dependencies.
- `app/dashboard/page.tsx:23-38` defines the dashboard as anchor-based sidebar items; `app/dashboard/page.tsx:111-120` renders the whole Studio OS from static imports.
- `lib/rhyze-platform.ts:1-55` starts the hard-coded platform data; class occurrences begin at `lib/rhyze-platform.ts:55`.
- `components/sections/StudioOSCalendarBoard.tsx:17-29` derives the calendar directly from hard-coded arrays.
- `components/sections/StudioOSDetailLayer.tsx:25-32` begins a hard-coded modal data catalog.
- `app/signin/page.tsx:14-30` renders a portal preview with no authentication; its metrics come from static `customerPortal` data.
- `app/api/contact/route.ts:4-23` and `app/api/newsletter/route.ts:4-18` validate then log submissions.
- `tsconfig.json:3-20` confirms strict TypeScript and the `@/*` alias.

## Decisions and Boundaries

1. Use one deployable Next.js application and one PostgreSQL database. Do not split into microservices.
2. Use route groups:
   - Public: existing marketing pages, `/schedule`, `/classes/[slug]`, `/checkout/*`.
   - Auth: `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`.
   - Member: `/member/*`.
   - Instructor: `/instructor/*`.
   - Staff: `/admin/*` for OWNER, ADMIN, and MANAGER according to permissions.
3. Use explicit permission checks in server actions/route handlers and domain services. Middleware may redirect anonymous users but must not be the only authorization layer.
4. Store money as integer cents and all timestamps in UTC. Render schedule dates in `America/New_York`.
5. Treat Stripe webhook events as authoritative for payment/subscription state. Never grant credits only from a browser redirect.
6. Make booking and waitlist transitions transactional and idempotent. Capacity, credits, waiver, overlap, and duplicate checks occur inside the same database transaction.
7. Keep immutable ledgers for credits, payments, refunds, attendance changes, email sends, and staff actions.
8. Archive business records; do not hard-delete anything referenced by bookings, payments, attendance, or reports.
9. Email is Phase 5. SMS fields/preferences may be modeled in Phase 1, but Twilio is out of scope until a later approved phase.
10. Gift cards are explicitly deferred.
11. Split delivery into the seven requested phases. Each phase must leave a working, testable product slice.

## Shared File Organization

New application code should follow these boundaries:

- `app/(public)/...`: public schedule, catalog, and checkout entry pages.
- `app/(auth)/...`: account lifecycle pages.
- `app/(portal)/member/...`: member workspace.
- `app/(portal)/instructor/...`: instructor workspace.
- `app/(studio)/admin/...`: owner/manager workspace.
- `app/api/.../route.ts`: webhook, integration, export, and read API endpoints only.
- `components/app-shell/...`: dedicated admin/instructor/member shells.
- `components/domain/<area>/...`: reusable UI for schedules, bookings, memberships, reports.
- `lib/auth/...`: Auth.js configuration, password and token utilities, permission policies.
- `lib/db/...`: Prisma client and transaction helpers.
- `lib/domain/<area>/...`: server-only business services and typed errors.
- `lib/validation/...`: Zod schemas shared by actions and route handlers.
- `lib/email/...`, `lib/jobs/...`, `lib/stripe/...`: integration adapters.
- `prisma/schema.prisma`, `prisma/migrations/...`, `prisma/seed.ts`: persistence.
- `tests/unit/...`, `tests/integration/...`, `tests/e2e/...`: behavior-focused tests.

## Phase 0: Safety Checkpoint Before Phase 1

This is not product implementation. It protects the existing RHYZE #2 work.

**Files/actions**

- Review the current dirty tree and separate intentional RHYZE #2 changes from generated files.
- Commit the existing RHYZE #2 state, or create an isolated `rhyze-3-platform` worktree from an approved commit.
- Copy `.env.example` only after secrets and deployment environments are agreed.
- Do not commit `.env`, database credentials, Stripe secrets, webhook secrets, Resend keys, or Auth secrets.

**Verification**

```bash
git status --short
npm test
npm run typecheck
npm run build
```

**Exit gate:** clean or intentionally isolated working tree and passing existing verification.

---

## Phase 1: Foundation, Authentication, Roles, and Database

### Outcome

Real accounts, database-backed sessions, role enforcement, member profiles, notification preferences, versioned waivers, and audit logging. Existing public pages remain functional.

### Files to create

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `lib/db/prisma.ts`
- `auth.ts`
- `app/api/auth/[...nextauth]/route.ts`
- `middleware.ts`
- `lib/auth/password.ts`
- `lib/auth/permissions.ts`
- `lib/auth/session.ts`
- `lib/auth/tokens.ts`
- `lib/validation/auth.ts`
- `lib/validation/profile.ts`
- `lib/domain/accounts/account-service.ts`
- `lib/domain/waivers/waiver-service.ts`
- `app/(auth)/sign-in/page.tsx`
- `app/(auth)/sign-up/page.tsx`
- `app/(auth)/forgot-password/page.tsx`
- `app/(auth)/reset-password/[token]/page.tsx`
- `app/(portal)/member/layout.tsx`
- `app/(portal)/member/profile/page.tsx`
- `app/(portal)/member/waiver/page.tsx`
- `components/app-shell/MemberShell.tsx`
- `components/domain/accounts/*`
- `components/domain/waivers/*`
- `types/next-auth.d.ts`
- `tests/unit/auth/permissions.test.ts`
- `tests/unit/auth/password.test.ts`
- `tests/unit/waivers/waiver-rules.test.ts`
- `tests/integration/auth/account-lifecycle.test.ts`
- `tests/integration/auth/authorization.test.ts`
- `tests/e2e/auth.spec.ts`

### Files to modify

- `package.json`: add Prisma, Auth.js, password hashing, Vitest, Testing Library, and Playwright scripts/dependencies.
- `app/layout.tsx`: keep the marketing shell limited to public pages.
- `app/signin/page.tsx`: replace/redirect to `/sign-in`; move the preview content into the protected member area later.
- `app/join/page.tsx`: route account creation and plan selection through the new signup flow without taking payment yet.
- `components/layout/Header.tsx` and `components/layout/MobileNav.tsx`: show Sign In or role-appropriate Dashboard links from session state.
- `.gitignore` and new `.env.example`: document variable names only.

### Database models/tables

- `User`: identity, email, normalized email, password hash, status, global role, timestamps, last login.
- `Account`, `Session`, `VerificationToken`: Auth.js adapter tables.
- `MemberProfile`: phone, address, date of birth optional, emergency contact, accessibility/internal flags, preferred name.
- `InstructorProfile`: bio, image, active flag, editable-by-instructor flag.
- `NotificationPreference`: transactional email, reminders, marketing email, SMS placeholder, timezone.
- `PasswordResetToken`: hashed single-use token and expiry.
- `WaiverVersion`: version, title, body, effective date, active/required flags.
- `WaiverAcceptance`: waiver version, user, timestamp, IP, user agent.
- `AuditLog`: actor, action, entity type/id, before/after JSON, request metadata.
- Enums: `Role { OWNER ADMIN MANAGER INSTRUCTOR MEMBER }`, `UserStatus`, and auditable action types.

### API routes/server actions

- Auth.js handlers at `/api/auth/[...nextauth]`.
- Server actions for signup, profile update, notification preferences, waiver acceptance, forgot password, and reset password.
- `GET /api/session` only if a client component truly needs session data beyond Auth.js helpers.
- No generic CRUD endpoint for users. Staff member management arrives in Phase 6 with explicit permissions.

### UI

- Dedicated sign-in/sign-up/reset flows matching Rhyze branding.
- Member profile and waiver screens.
- Role-aware app shell placeholders for `/member`, `/instructor`, and `/admin`.
- Unauthorized and suspended-account states.
- Accessible form errors, loading states, confirmation messages, focus management, and mobile behavior.

### Tests

- Password hashing/verification and token expiry/single use.
- Signup email uniqueness and normalized email.
- Session creation/logout/revocation.
- Every role/permission matrix path, including MANAGER limitations.
- Server-side denial when a user directly invokes an unauthorized action.
- Waiver acceptance records the exact active version; a new required version invalidates booking eligibility.
- Marketing opt-out does not disable required transactional email.

### Verification commands

```bash
npx prisma format
npx prisma validate
npx prisma migrate dev
npx prisma db seed
npm run test:unit
npm run test:integration
npm run test:e2e -- auth.spec.ts
npm run lint
npm run typecheck
npm run build
```

### Risks and edge cases

- The current branch is dirty; isolate Phase 1 before changing dependencies or layouts.
- Credentials authentication requires rate limiting, generic error messages, strong password rules, token hashing, and session revocation.
- Role data exposed in a session is a convenience; every mutation must re-check authority server-side.
- Decide whether minors are allowed before collecting guardian signatures; Phase 1 can model a guardian name but should not invent legal policy.
- IP addresses are personal data; define retention and access policy.
- Existing `/signin` links and bookmarks require a stable redirect.

### Suggested commits

1. `chore: add database and test foundation`
2. `feat: add account lifecycle and sessions`
3. `feat: enforce studio role permissions`
4. `feat: add profiles preferences and versioned waivers`

**Phase 1 exit gate:** a seeded owner, manager, instructor, and member can sign in; each sees only permitted routes; profile/waiver changes persist; all verification passes.

---

## Phase 2: Class Templates and Schedule

### Outcome

Database-backed class catalog and occurrences with recurring-series editing, conflict detection, public filtering, and a maintainable admin calendar.

### Files to create

- `lib/domain/classes/class-template-service.ts`
- `lib/domain/schedule/occurrence-service.ts`
- `lib/domain/schedule/recurrence-service.ts`
- `lib/domain/schedule/conflict-service.ts`
- `lib/validation/class-template.ts`
- `lib/validation/schedule.ts`
- `app/(public)/schedule/page.tsx`
- `app/(public)/schedule/[occurrenceId]/page.tsx`
- `app/(studio)/admin/classes/page.tsx`
- `app/(studio)/admin/classes/new/page.tsx`
- `app/(studio)/admin/classes/[templateId]/page.tsx`
- `app/(studio)/admin/schedule/page.tsx`
- `components/domain/classes/*`
- `components/domain/schedule/*`
- `tests/unit/schedule/recurrence.test.ts`
- `tests/unit/schedule/conflicts.test.ts`
- `tests/integration/classes/class-template-crud.test.ts`
- `tests/integration/schedule/occurrence-management.test.ts`
- `tests/e2e/public-schedule.spec.ts`
- `tests/e2e/admin-schedule.spec.ts`

### Files to modify

- `app/classes/page.tsx`, `app/classes/[slug]/page.tsx`: read active templates/occurrences from database.
- `components/sections/WeeklyCalendar.tsx`: replace static data with typed schedule props or replace with new schedule components.
- `app/dashboard/page.tsx`: redirect to `/admin` or become the admin overview in Phase 6.
- `lib/classes.ts`, `lib/rhyze-platform.ts`: retain only seed/import data during migration, then remove runtime schedule usage.

### Database models/tables

- `ClassCategory`
- `ClassTemplate`: name, slug, description, image, duration, intensity, default capacity, drop-in price cents, equipment, policy override, tags, active/archived state.
- `ClassTag` and `ClassTemplateTag`
- `Location` and `Room`
- `ClassSeries`: recurrence rule, timezone, start/end, parent template, default instructor/room/capacity.
- `ClassOccurrence`: start/end UTC, local timezone, instructor, room, capacity, price/rule overrides, public/internal notes, status, series link.
- `ClassEligibility`: template/category to membership product relation (populated fully in Phase 4).
- `ScheduleChange`: audit-friendly change/cancellation reason.

### API routes/server actions

- Staff server actions: create/edit/duplicate/archive template; create/edit/cancel occurrence; create series; apply edits to one/future/all; duplicate occurrence.
- `GET /api/schedule?from=&to=&category=&instructor=` for the public schedule.
- `GET /api/schedule/[occurrenceId]` for public details.
- Image upload should use the chosen object-storage provider; do not store image binaries in PostgreSQL.

### UI

- Replace the one-page class manager with a searchable table and focused create/edit forms.
- Admin calendar with day/week/month views, quick-create, class detail drawer, status badges, and conflict warnings.
- Public weekly schedule with date, category, and instructor filters; spots remaining can initially be capacity minus active bookings once Phase 3 lands.
- Clear “cancelled,” “full,” “booking not open,” and inactive states.

### Tests

- RRULE/date expansion across daylight-saving transitions in `America/New_York`.
- Editing one occurrence does not mutate siblings; editing future occurrences creates a clean series boundary.
- Instructor and room overlap detection; back-to-back classes are allowed.
- Archived templates disappear publicly but historical occurrences remain intact.
- Capacity cannot fall below active bookings after Phase 3; initially protect the invariant in the service contract.
- Internal notes never appear in public responses.

### Verification commands

```bash
npx prisma migrate dev
npm run test:unit -- schedule
npm run test:integration -- classes schedule
npm run test:e2e -- public-schedule.spec.ts admin-schedule.spec.ts
npm run lint
npm run typecheck
npm run build
```

### Risks and edge cases

- Recurrence editing is a data problem, not only a calendar UI problem.
- DST, timezone rendering, cancelled exceptions, instructor substitution, and room conflicts.
- Current content combines instructor names into class names; templates should separate class identity from assigned instructor.
- Do not delete historical templates or occurrences referenced by later bookings.

### Suggested commits

1. `feat: add class catalog persistence`
2. `feat: add occurrence and recurrence services`
3. `feat: add admin schedule workspace`
4. `feat: connect public schedule to database`

**Phase 2 exit gate:** staff can manage templates and recurring schedules safely, conflicts are blocked/warned, and the public schedule is database-backed.

---

## Phase 3: Booking, Waitlist, and Attendance

### Outcome

Transactional booking and waitlist rules, auto-promotion, member booking views, and instructor/admin attendance tools.

### Files to create

- `lib/domain/bookings/booking-service.ts`
- `lib/domain/bookings/booking-policy.ts`
- `lib/domain/bookings/waitlist-service.ts`
- `lib/domain/credits/credit-service.ts`
- `lib/domain/attendance/attendance-service.ts`
- `lib/validation/booking.ts`
- `lib/validation/attendance.ts`
- `app/(public)/schedule/[occurrenceId]/book/page.tsx`
- `app/(portal)/member/bookings/page.tsx`
- `app/(portal)/member/bookings/[bookingId]/page.tsx`
- `app/(portal)/instructor/classes/[occurrenceId]/roster/page.tsx`
- `app/(studio)/admin/bookings/page.tsx`
- `app/(studio)/admin/schedule/[occurrenceId]/roster/page.tsx`
- `app/api/admin/attendance/[occurrenceId]/export/route.ts`
- `components/domain/bookings/*`
- `components/domain/attendance/*`
- `tests/unit/bookings/booking-policy.test.ts`
- `tests/unit/bookings/waitlist.test.ts`
- `tests/unit/credits/credit-ledger.test.ts`
- `tests/integration/bookings/concurrency.test.ts`
- `tests/integration/bookings/lifecycle.test.ts`
- `tests/integration/attendance/roster.test.ts`
- `tests/e2e/member-booking.spec.ts`
- `tests/e2e/instructor-roster.spec.ts`

### Files to modify

- Public schedule/detail cards: real spots, waitlist, booking-window, and member eligibility state.
- Member shell: upcoming/past/cancelled booking navigation.
- Instructor shell: assigned class and roster navigation.
- Phase 2 occurrence service: capacity-reduction guard and cancellation handling.

### Database models/tables

- `Booking`: occurrence/user, status, source, booked/cancelled timestamps, policy snapshot, payment/access references.
- `WaitlistEntry`: occurrence/user, position/order timestamp, status, promotion/expiry timestamps.
- `AttendanceRecord`: booking/user/occurrence, status, checked-in timestamp, marked-by user, note.
- `CreditAccount`: user/product grant and current lifecycle.
- `CreditLedgerEntry`: immutable grant, reserve, consume, release, expire, restore, adjustment entries.
- `BookingPolicy`: global/category/template/occurrence window and cancellation rules.
- Enums for booking, waitlist, attendance, and credit transaction states.

### API routes/server actions

- Book, cancel, join waitlist, leave waitlist.
- Staff roster actions: check in, attended, no-show, late cancel, restore credit, add class note.
- CSV export route authorized for instructor of that class or permitted staff.
- Occurrence cancellation service cancels bookings, restores eligible credits, and queues notification events for Phase 5.

### UI

- Booking confirmation screen that explains the exact access/credit used.
- Member booking list with cancel deadline and outcome.
- Waitlist position/status with leave action.
- Roster optimized for a phone/tablet at the front desk.
- Bulk attendance finalize action plus individual corrections with an audit reason.

### Tests

- Duplicate booking and duplicate waitlist prevention.
- Overlapping booking detection.
- Booking open/close window and cancellation cutoff at exact boundary times.
- Waiver requirement.
- Capacity race: two requests for the final spot result in one booking and one waitlist/full response.
- Credit reservation/consumption/release is balanced and idempotent.
- Unlimited access does not create negative/fictional credits.
- Waitlist promotion is FIFO among eligible members and re-checks overlap, waiver, access, and expiry.
- Manual restore requires permission and creates an audit/ledger entry.

### Verification commands

```bash
npx prisma migrate dev
npm run test:unit -- bookings credits attendance
npm run test:integration -- bookings attendance
npm run test:e2e -- member-booking.spec.ts instructor-roster.spec.ts
npm run lint
npm run typecheck
npm run build
```

### Risks and edge cases

- High-risk concurrency: use transactions, unique constraints, locking/advisory locking as supported, and idempotency keys.
- A promoted member may no longer be eligible.
- Instructor substitutions affect roster permission.
- Class cancellation, member cancellation, late cancellation, and no-show restore different credits.
- Attendance can exist for approved walk-ins; model this explicitly rather than fabricating bookings.

### Suggested commits

1. `feat: add transactional booking rules`
2. `feat: add waitlists and automatic promotion`
3. `feat: add credit ledger`
4. `feat: add roster and attendance workflows`

**Phase 3 exit gate:** concurrent booking rules hold, members control bookings/waitlists, and authorized staff can complete attendance with auditable credit corrections.

---

## Phase 4: Stripe Payments, Memberships, and Class Packs

### Outcome

Admins define sellable access products; members buy subscriptions, packs, and drop-ins through Stripe; webhooks reconcile revenue and credits.

### Files to create

- `lib/stripe/client.ts`
- `lib/stripe/webhook-service.ts`
- `lib/domain/products/product-service.ts`
- `lib/domain/memberships/membership-service.ts`
- `lib/domain/payments/payment-service.ts`
- `lib/validation/product.ts`
- `app/api/stripe/webhook/route.ts`
- `app/api/stripe/checkout/route.ts`
- `app/api/stripe/customer-portal/route.ts`
- `app/(public)/checkout/[productId]/page.tsx`
- `app/(public)/checkout/success/page.tsx`
- `app/(portal)/member/membership/page.tsx`
- `app/(portal)/member/billing/page.tsx`
- `app/(portal)/member/invoices/page.tsx`
- `app/(studio)/admin/products/page.tsx`
- `app/(studio)/admin/payments/page.tsx`
- `app/(studio)/admin/payments/[paymentId]/page.tsx`
- `components/domain/products/*`
- `components/domain/billing/*`
- `tests/unit/memberships/eligibility.test.ts`
- `tests/unit/payments/webhook-mapping.test.ts`
- `tests/integration/payments/webhook-idempotency.test.ts`
- `tests/integration/payments/refunds.test.ts`
- `tests/e2e/purchase.spec.ts`

### Files to modify

- `app/join/page.tsx`, `components/sections/PricingCards.tsx`, and booking purchase fallback: load active public products.
- Booking service: accept access grants created from successful payment events.
- Member profile: link to Stripe Customer Portal for saved payment methods/subscription self-service.

### Database models/tables

- `Product`: type, name, description, price cents, billing interval, credit/unlimited rules, trial rules, cancellation policy, visibility, active state, Stripe product/price IDs.
- `ProductEligibility`: eligible categories/templates.
- `Membership`: user/product, status, period, cancellation/end dates, Stripe subscription/customer IDs.
- `AccessGrant`: membership, pack, trial, drop-in, validity and usage rules.
- `Purchase`: user/product, amount, tax/discount, status, Stripe Checkout Session/PaymentIntent IDs.
- `Payment`: charge/payment intent, amount, currency, status, failure details.
- `Refund`: payment, amount, reason, Stripe refund ID, staff actor.
- `InvoiceRecord`: Stripe invoice ID/number/status/hosted URLs/totals.
- `StripeEvent`: event ID, type, received/processed/error state for idempotency.
- `RevenueEntry`: immutable recognized cash/refund record for reports.

### API routes/server actions

- Create Stripe Checkout Session for recurring or one-time products.
- Stripe webhook with raw-body signature verification.
- Create Stripe Customer Portal session.
- Admin create/edit/archive/sync products and initiate partial/full refunds.
- Booking-time drop-in checkout must preserve a pending booking intent with expiry; it cannot reserve capacity forever.

### UI

- Product editor with access rules, visibility, and Stripe sync state.
- Checkout handoff and post-checkout processing state.
- Member membership/pass, credit balance, invoices/receipts, and payment-method management.
- Admin payment ledger, failed-payment queue, refund dialog with reason and amount validation.

### Tests

- Webhook signature rejection, duplicate delivery idempotency, and out-of-order events.
- Subscription active/past_due/cancelled transitions.
- One-time pack grants exact credits once.
- Trial first-use activation and expiry.
- Eligible class/category enforcement.
- Refund does not silently restore consumed credits; explicit policy decides restoration.
- Amount/currency are read from Stripe/database, never trusted from the browser.

### Verification commands

```bash
npx prisma migrate dev
stripe listen --forward-to localhost:3001/api/stripe/webhook
npm run test:unit -- memberships payments
npm run test:integration -- payments
npm run test:e2e -- purchase.spec.ts
npm run lint
npm run typecheck
npm run build
```

Use Stripe test clocks for subscription renewal/failure/cancellation scenarios.

### Risks and edge cases

- Webhooks can be duplicated, delayed, or out of order.
- Taxes, discounts, prorations, refunds, disputes, and subscription schedule changes.
- Product price edits should create new Stripe Prices; historical purchases retain snapshots.
- Saved payment details remain in Stripe; never store card numbers.
- Define whether failed subscriptions immediately block booking or receive a grace period.

### Suggested commits

1. `feat: add product and access models`
2. `feat: add Stripe checkout and webhook reconciliation`
3. `feat: add member billing workspace`
4. `feat: add admin payment and refund tools`

**Phase 4 exit gate:** test-mode subscriptions and one-time products reconcile through webhooks, grants/credits are correct, invoices display, and authorized refunds are auditable.

---

## Phase 5: Notifications and Reminders

### Outcome

Transactional email and durable background processing for confirmations, reminders, waitlist promotion, trials, payment failures, and admin notices.

### Files to create

- `lib/email/resend.ts`
- `lib/email/templates/*`
- `lib/email/render.ts`
- `lib/jobs/client.ts`
- `lib/jobs/events.ts`
- `lib/jobs/functions/booking-emails.ts`
- `lib/jobs/functions/class-reminders.ts`
- `lib/jobs/functions/waitlist-promotion.ts`
- `lib/jobs/functions/membership-emails.ts`
- `lib/jobs/functions/payment-emails.ts`
- `lib/jobs/functions/trial-reminders.ts`
- `app/api/inngest/route.ts`
- `app/(studio)/admin/automations/page.tsx`
- `tests/unit/email/templates.test.tsx`
- `tests/unit/jobs/reminder-policy.test.ts`
- `tests/integration/jobs/idempotency.test.ts`
- `tests/integration/jobs/reminder-scheduling.test.ts`

### Files to modify

- Account, booking, waitlist, attendance, membership, and payment services: publish domain/job events after committed transactions.
- Notification preferences: apply marketing versus transactional rules.
- Admin settings: configurable reminder timing and admin recipient list.

### Database models/tables

- `NotificationEvent`: domain event, recipient, payload version, idempotency key.
- `EmailMessage`: template, recipient, provider ID, status, attempts, timestamps, error.
- `ReminderSchedule`: occurrence/user/booking, kind, due time, sent/cancelled state.
- `EmailSuppression`: bounce/complaint/unsubscribe and scope.
- `AutomationSetting`: studio-configurable timings and enablement.

### API routes/jobs

- Inngest serve route.
- Durable functions for welcome, booking confirmation/cancellation, class reminder, waitlist joined/promoted, membership confirmation, receipt, failed payment, trial ending, password reset, and admin signup/purchase.
- Resend webhook route may be added for delivery, bounce, and complaint status.
- Do not call Resend directly from page requests except to enqueue an event; password reset should also be queued with a short SLA.

### UI

- Admin automation status and recent failures.
- Member notification preferences.
- Email previews for staff; no campaign sending yet.

### Tests

- Same idempotency key sends once.
- Booking cancellation removes pending reminders.
- Schedule changes reschedule reminders.
- Marketing opt-out suppresses campaigns but not receipts/security/booking messages.
- Bounce/complaint suppression and retry/backoff.
- Templates render with safe missing optional data.

### Verification commands

```bash
npm run inngest:dev
npm run test:unit -- email jobs
npm run test:integration -- jobs
npm run lint
npm run typecheck
npm run build
```

### Risks and edge cases

- Job provider choice must match production hosting. If long-lived workers are available, pg-boss is a viable PostgreSQL-backed alternative; do not implement both.
- Reminders must handle reschedules, cancellations, timezone/DST, provider outages, and duplicate job delivery.
- Separate required transactional messages from marketing consent.

### Suggested commits

1. `feat: add transactional email adapter and templates`
2. `feat: add durable notification jobs`
3. `feat: add reminders and delivery observability`

**Phase 5 exit gate:** all required email events are queued outside page requests, idempotent, observable, and preference-aware.

---

## Phase 6: Admin, Instructor, and Member Dashboards

### Outcome

Replace the RHYZE #2 prototype with organized, role-specific workspaces powered by real data.

### Files to create

- `app/(studio)/admin/layout.tsx`
- `app/(studio)/admin/page.tsx`
- `app/(studio)/admin/members/page.tsx`
- `app/(studio)/admin/members/[userId]/page.tsx`
- `app/(studio)/admin/instructors/page.tsx`
- `app/(studio)/admin/settings/page.tsx`
- `app/(portal)/instructor/layout.tsx`
- `app/(portal)/instructor/page.tsx`
- `app/(portal)/instructor/schedule/page.tsx`
- `app/(portal)/instructor/profile/page.tsx`
- `app/(portal)/member/page.tsx`
- `app/(portal)/member/attendance/page.tsx`
- `app/(portal)/member/receipts/page.tsx`
- `components/app-shell/AdminShell.tsx`
- `components/app-shell/InstructorShell.tsx`
- `components/app-shell/AppSidebar.tsx`
- `components/app-shell/AppHeader.tsx`
- `components/domain/dashboard/*`
- `lib/domain/dashboard/admin-dashboard-query.ts`
- `lib/domain/dashboard/instructor-dashboard-query.ts`
- `lib/domain/dashboard/member-dashboard-query.ts`
- `tests/integration/dashboards/role-data.test.ts`
- `tests/e2e/admin-dashboard.spec.ts`
- `tests/e2e/instructor-dashboard.spec.ts`
- `tests/e2e/member-dashboard.spec.ts`

### Files to modify/remove

- `app/dashboard/page.tsx`: redirect by role or remove after all links point to role dashboards.
- `app/signin/page.tsx`: redirect to `/sign-in`.
- `lib/rhyze-platform.ts`: remove remaining runtime prototype data.
- `components/sections/StudioOSCalendarBoard.tsx` and `StudioOSDetailLayer.tsx`: retire or break into real domain components.
- Public `Header`/`Footer`: exclude from protected app shells.

### Database work

- No new core tables expected.
- Add performance indexes/materialized aggregates only after query measurement.
- Use AuditLog and existing domain tables for activity feeds.

### API routes/server actions

- Dashboard queries are server-side read models.
- Admin member actions: update roles within policy, suspend/reactivate, adjust credits with reason, resend waiver/reset links.
- Instructor profile update only when allowed.
- CSV routes remain explicit and permission-scoped.

### UI

- Admin overview: today’s classes/bookings/waitlists, new signups, active/trial members, revenue today/week/month, failed payments, purchases, low attendance, top classes, top instructors.
- Dedicated pages rather than one huge scrolling dashboard.
- Instructor: assigned classes, today/upcoming roster, attendance, notes, schedule, optional bio/photo.
- Member: upcoming classes, history, membership/pass, credits, invoices, profile, waiver, preferences, payment-method portal.
- Shared design system: compact metric cards, searchable/sortable tables, filters encoded in URL, drawers for quick detail, destructive-action confirmation, empty/error/loading states.
- Preserve brand colors and display typography, but use body type for dense operational content and stronger spacing/hierarchy.

### Tests

- Role-specific dashboard data cannot leak across users/instructors.
- Owner/admin/manager action differences.
- Metrics match fixture database totals.
- Navigation and responsive layouts.
- Keyboard access, focus order, labels, contrast, and reduced motion.

### Verification commands

```bash
npm run test:integration -- dashboards
npm run test:e2e -- admin-dashboard.spec.ts instructor-dashboard.spec.ts member-dashboard.spec.ts
npm run test:a11y
npm run lint
npm run typecheck
npm run build
```

### Risks and edge cases

- Dashboard totals must define date range, timezone, payment status, refunds, and cancellations consistently.
- Avoid loading every metric in one blocking query; parallelize bounded server queries and cache only safe aggregates.
- Dense branded UI can harm readability; operational pages need clarity before decoration.
- Mobile roster is a primary workflow, not an afterthought.

### Suggested commits

1. `feat: add shared role-based app shells`
2. `feat: add member dashboard`
3. `feat: add instructor dashboard`
4. `feat: replace Studio OS with real admin workspace`

**Phase 6 exit gate:** every role has a responsive, accessible dashboard driven by production-shaped data; the static prototype is no longer a runtime dependency.

---

## Phase 7: Reports, Campaigns, and Polish

### Outcome

Operational reports/exports, consent-aware email campaigns, performance/accessibility/security hardening, and launch preparation.

### Files to create

- `lib/domain/reports/revenue-report.ts`
- `lib/domain/reports/attendance-report.ts`
- `lib/domain/reports/membership-report.ts`
- `lib/domain/reports/trial-conversion-report.ts`
- `lib/domain/reports/class-performance-report.ts`
- `lib/domain/reports/instructor-performance-report.ts`
- `lib/domain/reports/csv.ts`
- `lib/domain/campaigns/campaign-service.ts`
- `lib/domain/campaigns/segment-service.ts`
- `lib/jobs/functions/campaign-send.ts`
- `app/(studio)/admin/reports/page.tsx`
- `app/(studio)/admin/reports/[report]/page.tsx`
- `app/(studio)/admin/campaigns/page.tsx`
- `app/(studio)/admin/campaigns/new/page.tsx`
- `app/(studio)/admin/campaigns/[campaignId]/page.tsx`
- `app/api/admin/reports/[report]/export/route.ts`
- `app/api/email/unsubscribe/route.ts`
- `app/(public)/unsubscribe/page.tsx`
- `components/domain/reports/*`
- `components/domain/campaigns/*`
- `tests/unit/reports/calculations.test.ts`
- `tests/unit/campaigns/segments.test.ts`
- `tests/integration/reports/exports.test.ts`
- `tests/integration/campaigns/lifecycle.test.ts`
- `tests/e2e/reports-campaigns.spec.ts`

### Files to modify

- Admin navigation and overview deep links.
- Notification job registry for scheduled campaigns.
- Database indexes based on measured report queries.
- Security headers, rate limits, error monitoring, and operational documentation.

### Database models/tables

- `Campaign`: subject, preview text, content, segment definition snapshot, status, scheduled/sent timestamps, creator.
- `CampaignRecipient`: campaign/user/email, eligibility snapshot, status, provider ID, timestamps/error.
- `CampaignTestSend`
- `UnsubscribeEvent`
- Optional `DailyStudioMetric` only if live aggregation is too expensive after measurement.

### API routes/jobs

- Report query and streamed CSV export routes.
- Campaign preview, test send, schedule, cancel-before-send, and send-now actions.
- Background fan-out with rate limiting and per-recipient idempotency.
- One-click unsubscribe and suppression handling.

### UI

- Reports: revenue, attendance, memberships, trial conversion, new signups, failed payments, class performance, instructor performance.
- Shared date-range, status, category, instructor, and product filters.
- CSV exports preserve the same filters and include an export timestamp/timezone.
- Campaign composer, segment estimator, preview, test send, scheduled status, and send results.
- Final polish: skeletons, empty/error states, print/CSV clarity, mobile tables, accessible charts, and brand consistency.

### Tests

- Report calculations reconcile against known fixtures including refunds and failed payments.
- Trial conversion denominator and conversion window are explicit.
- Attendance/no-show/late-cancel definitions remain consistent across dashboards and exports.
- Segment snapshots do not gain new recipients after scheduling unless explicitly designed.
- Unsubscribed/complaint/bounced recipients are excluded.
- Campaign send is idempotent and cannot be edited after dispatch begins.
- CSV injection prevention for cells starting with `=`, `+`, `-`, or `@`.
- Load, accessibility, dependency/security, backup/restore, and webhook replay smoke tests.

### Verification commands

```bash
npm run test:unit -- reports campaigns
npm run test:integration -- reports campaigns
npm run test:e2e -- reports-campaigns.spec.ts
npm run test:a11y
npm run test:security
npm run lint
npm run typecheck
npm run build
```

### Risks and edge cases

- Report definitions must be agreed with the owner before numbers are trusted.
- Large CSVs should stream and be generated asynchronously when necessary.
- Campaign compliance requires physical address, unsubscribe, consent evidence, suppression, and provider feedback handling.
- Instructor performance metrics can create harmful incentives; label and scope them carefully.

### Suggested commits

1. `feat: add operational reports and CSV exports`
2. `feat: add campaign segmentation and previews`
3. `feat: add scheduled campaign delivery`
4. `chore: harden accessibility security and launch operations`

**Phase 7 exit gate:** reports reconcile, campaigns are consent-safe and durable, accessibility/security checks pass, and launch runbooks are complete.

---

## Cross-Phase Migration and Launch Plan

Somble should remain the operational source until replacement flows pass acceptance testing.

1. Inventory Somble exports/APIs and define mappings for users, memberships, credits, future bookings, attendance, and invoices.
2. Build dry-run import scripts with row-level error reports and stable external IDs.
3. Import into staging, reconcile counts and balances, and obtain owner sign-off.
4. Freeze schedule/membership edits during the final migration window.
5. Run final delta import, enable Stripe products/subscriptions according to an approved customer migration strategy, and switch public links.
6. Keep a documented rollback path and read-only Somble access during the reconciliation period.
7. Never migrate raw card data; Stripe migration options require provider-supported procedures.

## Definition of Done for Every Phase

- Requirements for that phase are mapped to tests.
- Authorization is tested for permitted and forbidden roles.
- Schema migration is reversible or has a documented recovery procedure.
- Unit, integration, browser, lint, typecheck, and production build checks applicable to the phase pass.
- No secrets or customer data appear in source, fixtures, screenshots, or logs.
- Error/loading/empty/mobile/accessibility states are reviewed.
- Audit events exist for material staff and financial actions.
- Documentation and `.env.example` are current.
- One small commit per independently reviewable slice; no unrelated refactors.
- Phase is demonstrated and approved before the next phase starts.

## Open Decisions Required Before Their Phase

- Before Phase 1: production hosting, PostgreSQL provider, owner/admin email identities, whether minors/guardian waivers are supported, and password policy.
- Before Phase 2: canonical rooms/locations, class categories, booking window, cancellation cutoff, and series edit semantics.
- Before Phase 3: exact late-cancel/no-show/credit-restoration rules and waitlist promotion acceptance window.
- Before Phase 4: Stripe account readiness, tax handling, refund policy, subscription grace period, proration, and current Somble subscription migration approach.
- Before Phase 5: sending domain/DNS, Resend account, reminder timing, and whether production hosting supports Inngest as planned.
- Before Phase 7: report definitions, marketing consent language, physical mailing address, and campaign approval workflow.

## Plan Self-Review

- Coverage: all 15 requirement groups are assigned to a phase; SMS and gift cards are explicitly deferred as requested.
- Placeholders: no required implementation item is marked TBD/TODO.
- Consistency: class templates/occurrences precede booking; booking/credits precede payments; domain events precede notifications; real data precedes dashboards/reports.
- Scope: each phase has its own models, routes/actions, UI, tests, commands, risks, commits, and exit gate.
- Safety: no implementation is authorized by this plan; Phase 1 begins only after explicit approval and the Phase 0 checkpoint.
