# Public Media and Payment Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the requested instructor pay-rate, imported-payment, transfer, imagery, slideshow-management, and merchandise-checkout behavior without changing the established Rhyze design or deploying the site.

**Architecture:** Keep pay and transfer rules in their existing domain/services and change only the display and action surfaces. Add a small `ClassGalleryImage` content model, server actions, and a focused client slideshow so public and admin class imagery share one ordered data source. Preserve Stripe Checkout and webhook fulfillment as the sole merchandise payment authority.

**Tech Stack:** Next.js 14 App Router, TypeScript, React 18, Prisma/PostgreSQL, Stripe Checkout, Resend queue, Vitest/Testing Library, Tailwind CSS.

## Global Constraints

- Preserve the Rhyze dark/coral/gold branding and current page structure.
- Do not deploy to Netlify in this change set.
- Never invent payment totals; distinguish booking access from actual transaction records.
- Instructors can transfer bookings but cannot restore credits.
- Class slideshow advances every 4 seconds and includes previous, next, and pause/resume controls.
- Admin can upload, remove, and reorder slideshow images from the Admin Classes page.
- Run `npm run typecheck`, `npm test`, and `npm run build` before completion.

---

### Task 1: Instructor pay-rate and transfer surfaces

**Files:**
- Modify: `app/(studio)/admin/instructors/[userId]/page.tsx`
- Modify: `components/attendance/Roster.tsx`
- Test: `tests/unit/admin/instructor-operations.test.ts`
- Test: `tests/unit/bookings/instructor-transfer-surface.test.ts`

**Interfaces:**
- Consumes: `InstructorProfile.specialtyEventRateText`, existing transfer policy and transfer URL.
- Produces: admin summary card labeled `Specialty event pay rate`; instructor control labeled `Transfer credit`.

- [ ] Write source-surface tests that fail until the specialty summary and exact transfer wording are present and class/event direct-revenue card copy is absent.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Add the specialty summary card and update the transfer label without exposing restore-credit controls to instructors.
- [ ] Remove direct tracked revenue card rows and their now-unused page queries/imports.
- [ ] Re-run the focused tests.

### Task 2: Imported reservation payment labels

**Files:**
- Create: `lib/admin/imported-reservation-payment.ts`
- Modify: `app/(studio)/admin/members/[userId]/page.tsx`
- Test: `tests/unit/admin/imported-reservation-payment.test.ts`

**Interfaces:**
- Produces: `importedReservationPayment({ isEvent, accessType, priceCents }): { label: string; amountCents: number | null }`.

- [ ] Write failing tests for standard membership bookings (`Membership credit used`), purchased events (exact event price), and membership-covered events (no invented charge).
- [ ] Run the focused test and confirm failure because the helper does not exist.
- [ ] Implement the pure helper and use it in imported reservation rows.
- [ ] Keep Somble transaction rows as the official transferred payment ledger.
- [ ] Re-run the focused test.

### Task 3: Managed class slideshow

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260730120000_class_gallery_images/migration.sql`
- Create: `lib/classes/class-gallery.ts`
- Create: `components/sections/ClassGallerySlideshow.tsx`
- Create: `components/admin/ClassGalleryManager.tsx`
- Modify: `app/classes/page.tsx`
- Modify: `app/(studio)/admin/classes/page.tsx`
- Modify: `app/(studio)/admin/classes/actions.ts`
- Modify: `lib/storage/object-storage.ts`
- Copy: supplied class photos to `public/classes-slideshow/`
- Test: `tests/unit/classes/class-gallery.test.ts`
- Test: `tests/unit/classes/class-gallery-slideshow.test.tsx`

**Interfaces:**
- Produces: `loadClassGalleryImages()`, `ClassGallerySlideshow`, and admin add/remove/reorder actions.
- Storage: public uploads use the `classes-gallery/` object prefix and `/api/media/classes-gallery/...` URLs.

- [ ] Write failing tests for ordered active images, four-second autoplay, pause/resume, and previous/next controls.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Add the Prisma model/migration and copy the supplied seed images with stable URLs.
- [ ] Implement gallery loading, slideshow controls, reduced-motion handling, and responsive Rhyze styling.
- [ ] Implement admin upload, remove, and drag-reorder controls with path revalidation and audit logs.
- [ ] Re-run focused tests and apply the migration locally.

### Task 4: Requested public imagery

**Files:**
- Modify: `components/sections/ThreePillars.tsx`
- Modify: `app/event-choreography/page.tsx`
- Modify: `app/about/page.tsx`
- Copy: supplied images to `public/founders/`
- Test: `tests/unit/layout/requested-public-imagery.test.ts`

**Interfaces:**
- Produces: stable public image URLs for homepage choreography, choreography detail, and About.

- [ ] Write a failing source test for all three requested image destinations.
- [ ] Copy the supplied files using stable, lowercase names and update the pages.
- [ ] Re-run the focused test.

### Task 5: Merchandise payment audit and full verification

**Files:**
- Verify: `app/api/checkout/route.ts`
- Verify: `lib/payments/webhook-processor.ts`
- Test: `tests/unit/payments/merchandise-checkout-surface.test.ts`

**Interfaces:**
- Checkout creates a Stripe payment-mode session and reuses the logged-in Stripe customer when available.
- Webhook records the order/payment and queues customer receipt plus admin purchase notification.

- [ ] Add regression assertions for Stripe checkout mode, saved-customer reuse, merchandise order metadata, and admin notification.
- [ ] Run the focused payment tests.
- [ ] Run `npx prisma generate`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
- [ ] Report that saved cards may be selected inside Stripe Checkout but are never charged without the customer confirming checkout; report test/live environment status without exposing secrets.
