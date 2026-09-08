# Rhyze Email System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the complete branded Rhyze transactional email catalog with owner previews and isolated test sends.

**Architecture:** A typed catalog owns template metadata, samples, subjects, and rendering. The delivery worker and owner preview use the same renderer so previews match delivered email. A protected server action performs isolated Resend test sends and archives them without touching the queued-email worker.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma/PostgreSQL, Resend, Vitest.

## Global Constraints

- Send as `Rhyze Fitness <melissa@rhyzefit.com>` and route replies to `melissa@rhyzefit.com`.
- Preserve Rhyze black/coral/gold branding and existing Admin conventions.
- Keep automatic queue delivery paused until legacy queued messages are reviewed.
- Escape dynamic content and never expose internal IDs in recipient copy.

---

### Task 1: Typed email catalog and renderer

**Files:**
- Create: `lib/notifications/email-templates.ts`
- Modify: `lib/notifications/email-content.ts`
- Test: `tests/unit/notifications/email-templates.test.ts`

**Interfaces:**
- Produces: `emailTemplateCatalog`, `emailTemplateKeys`, `sampleEmailInput(template)`, and `renderTransactionalEmail(input)`.

- [ ] Write tests asserting the full catalog, branded shell, action URLs, friendly copy, escaping, and absence of internal-ID output.
- [ ] Run the test and confirm it fails because the catalog does not exist.
- [ ] Implement catalog metadata, samples, and all template-specific content.
- [ ] Run the test and confirm it passes.

### Task 2: Sender, reply routing, and missing lifecycle emails

**Files:**
- Modify: `app/api/jobs/email/route.ts`
- Modify: `app/(auth)/actions.ts`
- Modify: `lib/payments/webhook-processor.ts`
- Modify: `.env.example`
- Test: `tests/unit/notifications/email-lifecycle.test.ts`

**Interfaces:**
- Consumes: shared renderer and `EMAIL_FROM`/`EMAIL_REPLY_TO`.
- Produces: password reset, purchase confirmation, receipt/renewal notifications, and Melissa reply routing.

- [ ] Write tests for sender/reply behavior and each missing queue trigger.
- [ ] Run tests and confirm expected failures.
- [ ] Queue password-reset and payment-success emails with complete human-readable payloads.
- [ ] Merge Melissa's reply address with conversation archive addresses in the worker.
- [ ] Run tests and confirm they pass.

### Task 3: Owner preview and test-send experience

**Files:**
- Create: `app/(studio)/admin/email-previews/page.tsx`
- Create: `app/(studio)/admin/email-previews/actions.ts`
- Create: `components/admin/EmailPreviewGallery.tsx`
- Modify: `app/(studio)/admin/layout.tsx`
- Test: `tests/unit/notifications/email-preview-surfaces.test.ts`

**Interfaces:**
- Consumes: catalog, renderer, owner authorization, Prisma, and Resend.
- Produces: `/admin/email-previews` plus `sendTestEmailAction(formData)`.

- [ ] Write tests for owner-only navigation, full catalog rendering, recipient validation, and honest configuration failure.
- [ ] Run tests and confirm expected failures.
- [ ] Implement the gallery with desktop/mobile-safe iframe previews and test-send forms.
- [ ] Implement protected isolated test delivery and database archiving.
- [ ] Run tests and confirm they pass.

### Task 4: Verification and staging deployment

**Files:**
- Modify only files required by failures found during verification.

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Deploy Site 2 to Netlify.
- [ ] Verify `/admin/email-previews` requires an owner and confirm automatic delivery remains paused.
