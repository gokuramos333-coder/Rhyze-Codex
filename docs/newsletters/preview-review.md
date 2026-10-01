# Rhyze customer relationships and newsletters — preview review

Status: local preview only. No production deployment, migration, permission change, campaign delivery, customer contact or recurring marketing automation was performed.

## Review the experience

Open `http://127.0.0.1:4317/admin/newsletters` on this Mac. The Codex browser is signed into an isolated preview owner. Use **Membership leads** for the existing-customer outreach workspace. Only eight synthetic customers and sample schedule occurrences were seeded; the business's real customer database and email provider are not connected.

- **Clients → Membership leads:** filter non-members and engagement, record completed calls/texts with automatic staff initials and per-channel attempt numbers, maintain shared notes, assign follow-ups, and respect Do Not Contact. Existing profiles include outreach and separate newsletter activity. Status changes never activate memberships.
- **Newsletters → Templates:** 15 editable starters plus separately saved master templates.
- **Draft editor:** content blocks, safe font/color/layout controls, public photo upload/crop/resize/library, autosave with concurrent-edit protection, mobile/desktop and named/fallback previews, authoritative class/event content and correct Eastern week selection.
- **Audience:** overlapping groups deduplicate normalized email addresses. Unknown consent, opt-outs, DNC and suppression are excluded. Attendance uses attendance records, not booking counts. Counts are refreshed again at approval and dispatch.
- **Review and send:** explicit confirmation, local test capture, chosen date/time/zone with DST validation, scheduled queue and cancellation. Material schedule/settings changes hold unsent campaigns for review. No automatic weekly recurrence.
- **History/analytics:** immutable per-recipient HTML archives, independent duplicate drafts, dated searches, 15-row paging, recipient/link records, CSV export, suppression list and guarded internal click attribution. Legacy campaign archives are linked read-only, with missing historical metrics marked unavailable.

Try the sample draft for October 5. The captured campaign demonstrates history: five eligible sample recipients, three excluded, zero provider deliveries. **Run preview queue** processes only due approved local captures; it cannot contact an email provider in this preview configuration.

## Architecture and schema

This extends the existing Next.js / React / Prisma / PostgreSQL application. User remains the customer identity. EmailCampaign, EmailMessage, Resend signature verification, the existing five-minute email job and existing storage driver remain the integration points.

Additive migration: `20261001030000_newsletter_outreach`, mirrored under Prisma and Netlify native migrations. It adds outreach/consent, reusable templates, recipient send state, provider events, suppression, image-library and newsletter-setting records plus campaign version/approval/snapshot fields. Existing campaign rows default to LEGACY; no customer/membership/payment/booking correction is included.

The migration was applied to a separate local baseline schema containing sentinel existing records. Those records were preserved and the resulting database had no Prisma schema drift. Historical production-data-specific migrations were not used to seed the empty preview database; the preview alone was initialized from the current schema.

## Release prerequisites — not executed

1. Owner reviews this preview. Recheck the latest production/source and preserve newer work before preparing a guarded release. Follow `docs/operations/production-release.md`; previous unrelated approvals do not grant deployment or database permissions here.
2. Apply the reviewed additive migration through the approved release process. Keep newsletter delivery disabled during migration and initial verification.
3. Verify the existing Resend sender/domain, reply-to, postal address and Google review URL. Required existing secret configuration: `RESEND_API_KEY`, `EMAIL_FROM`, `RESEND_RECEIVING_API_KEY`, `RESEND_WEBHOOK_SECRET`, `JOB_SECRET`, canonical `NEXT_PUBLIC_APP_URL`, and durable production storage. No secret values belong in this document.
4. Verify signed provider event coverage: sent, delivered, delayed, opened, clicked, bounced, complained, failed and suppressed. Enable open/click capability indicators only after provider tracking is configured and checked; their absence is displayed as unavailable.
5. Explicit approved test sending uses `NEWSLETTER_TEST_SEND_ENABLED=true` and exact comma-separated `NEWSLETTER_TEST_RECIPIENTS`, together with configured provider and existing `EMAIL_DELIVERY_ENABLED=true`. Use an approved sandbox or staff test recipient before any marketing activation. Tests use the existing archive/provider with stable operation keys; uncertain acceptance is held for reconciliation.
6. Production campaigns remain disabled until separately authorized `NEWSLETTER_DELIVERY_ENABLED=true` and existing `EMAIL_DELIVERY_ENABLED=true`. `NEWSLETTER_CAPTURE` is local-only and requires a loopback app, loopback database, and exact preview database name; it is not a production bypass. Do not enable it in production.
7. Review actual opt-in evidence and existing suppressions. Existing account creation or purchase does not establish new marketing consent. Default membership or notification flags alone are insufficient. Verify provider suppression coverage before activation.
8. Verify queue invocation, operational alerts, provider limits, throughput and delivery in the authorized environment. The bounded dispatcher handles 20 recipients per run; the existing five-minute job is not an instant bulk-send SLA. Explicit rate limits have bounded retries; timeouts/unknown acceptance never trigger a blind resend.

Existing admin-page owner access remains enforced. The approved owners already include Gui, Vanessa and Melissa. APIs distinguish active admin newsletter access from staff outreach access; this change does not grant new roles or open the broader admin shell to managers.

## Honest limits and recovery

- Provider inbox delivery, live signed events, domain authentication, external tracking, Netlify cron execution and rendering in Gmail/Outlook/Apple Mail were not tested against real accounts. Local captures and signed fixtures are not live-provider proof.
- Opens and clicks are recorded signals, not proof of a human reading, a purchase cause or a posted Google review. Known automated events are labeled/excluded from attribution; unknown automation remains uncertain.
- Attribution uses the last qualifying same-site click carrying the matching campaign ID within the configured window. One outcome receives one attribution. Unsupported external conversions are not fabricated.
- Legacy queued marketing is excluded from the transactional worker. It needs a fresh consent-aware draft and approval; essential transactional templates remain on their existing path. Existing historical HTML is shown only where an archive exists.
- Uploaded campaign photos and the content-addressed newsletter logo must remain available for sent history. Do not overwrite or casually delete retained assets.
- Preview data is intentionally small; there is no production load-test or promised performance score. Archived bodies load on demand instead of in every dashboard response.
- For an uncertain send, inspect the immutable archive/provider ID and provider history before any approved recovery. Already accepted messages cannot be recalled. Do not retry an entire campaign to recover one recipient.
- Rollback plan: disable newsletter/test sending first, cancel unstarted campaigns through the reviewed workflow if authorized, then follow the guarded code rollback. Retain additive tables and histories; do not drop them or reactivate old queued marketing as a rollback shortcut. No production backup or rollback was performed by this task.
