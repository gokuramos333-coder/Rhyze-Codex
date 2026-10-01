# Verification record

Local preview based on source `4579b169992a17f00ed0bc1086066e45163f073d`. No production mutation or provider email submission.

## Automated evidence

- Existing unit regression suite plus new unit coverage: 1,613 tests passed, 311 files, no failures. Includes existing account, membership, booking, payment, refund, email and admin tests; this is automated local coverage, not a live replay of those workflows.
- Focused newsletter/security/PostgreSQL integration run: 52 tests passed. Four files: domain, authorization, raw signed webhook fixtures, and 14 integration cases against the exact isolated local preview database.
- Integration cases cover per-channel outreach idempotency; concurrent staff changes; DNC and membership invariants; duplicate campaigns; version/reapproval protection; concurrent dispatch; immutable per-recipient archives; send-time opt-outs; cancellation; duplicate/out-of-order events; unsubscribe isolation; sender-change holds; stable-content/idempotency rate-limit retries; timeout UNKNOWN without retry; idempotent local test capture; and external test allowlist denial.
- The expected concurrent-write rejection is logged during its test. It confirms a conflicting staff update is rejected rather than silently applied twice.
- Signed webhook tests use the installed Resend verifier and local signatures, with downstream processing mocked. Provider replay and live webhook delivery were not performed.
- Additive migration applied to a separate old-schema fixture. Existing sentinel user/campaign text survived; resulting schema matched Prisma without drift. Netlify/Prisma SQL files match.
- Type checking, lint and production build run locally with only isolated database configuration. No provider secrets were copied into this environment.

Evidence logs are in `~/Inbox/rhyze-newsletter-preview/`: `regression-tests.log`, `workflow-tests.log`, `migration-validation.log`, `typecheck.log`, `lint.log`, `build.log`.

## Browser checks executed

In Codex's browser, signed into the synthetic preview owner:

- Dashboard and 15 template starters render; create a weekly draft.
- Change name/subject, autosave, re-open retained data; preserve draft state separately from the source campaign.
- Review eligibility: eight matching records, five unique eligible, three excluded.
- Test email captured in the local archive; no provider delivery.
- Explicit confirm; run local queue; history shows five captures and zero confirmed deliveries.
- Duplicate last weekly creates a distinct draft without results or approval; choose a future week.
- Upload an existing public Rhyze photo, crop/resize, retain it in the image library; reorder image block and change font.
- Lead detail/timeline; add a shared note while personal attempt count stays one. No call or text is sent.
- Mobile lead table contains horizontal overflow inside its table; the outreach form fits a 390 px viewport, scrolls, and has reachable controls. Dialog focus and Escape-to-close exercised.
- Desktop/mobile email previews and responsive editor reviewed. Screenshot evidence retained with synthetic data only.
- Downloaded the campaign CSV through the browser and parsed the exported file: eight recipient rows, five captured and three excluded; no provider-delivery or engagement metrics fabricated.
- Reloaded the owner review draft: version 8, selected week October 5, five retained blocks including the uploaded photo. Left this authenticated local preview open in Codex.

## Self-review findings resolved

Email normalization around duplicate addresses, follow-up dates crossing UTC/Eastern midnight, changed sender/settings requiring reapproval, immutable content on a provider retry, independent transactional-worker progress if newsletters fail, archived-body loading on demand, restrictive image-library send validation, distinct unavailable metrics for legacy history, legacy marketing queue exclusion, optimistic saves after dispatch starts, and same-site campaign-linked attribution checks.

## Remaining external checks

No claim of production readiness or inbox delivery. Before activation: owner UX review, actual consent/suppression review, sender/domain and signed event coverage, approved sandbox/staff recipient delivery, provider limits/queue throughput, Gmail/Outlook/Apple Mail rendering, hosted scheduler, durable production storage and deployment/migration verification. Small synthetic data is not a production-scale load test. This was a self-review, not an independent reviewer or security penetration test.

## Owner design refinement — October 1, 2026

- Membership Leads now uses the existing Clients typography, white square panels, gold/orange rules, table treatment and cream surroundings. The shared workspace inherits Inter; lead headings use the existing display font. Outreach actions and permissions are unchanged.
- Newsletter schedules are grouped chronologically by Eastern calendar day, with the website's dark weekly-agenda styling, gold headings, highlighted event badges and instructor portraits. Empty and cancelled-only days produce no sections.
- Featured classes/events show a larger instructor portrait and description. Existing public instructor resolution handles substitutions; missing/unsafe photos fall back to the retained logo. Existing booking availability guards remain in place. Email fonts use client-safe fallbacks; matching in Gmail/Outlook/Apple Mail still requires real-client review.
- Verified 63 focused tests (including 14 isolated database integration cases), typecheck, lint and diff whitespace. Five added rendering cases cover mixed events/classes and ordering, Eastern midnight, omitted days, featured portraits and safe old-snapshot fallback. The earlier full build and 1,613-test run are historical; they were not rerun for this visual refinement.
- Browser reviewed at desktop and 390px mobile viewport, including a 375px email preview, photo loading, lead search and outreach dialog/Escape. No page horizontal overflow observed. Real inbox rendering is not claimed.
- Separate local draft `cmup2vq0n0001w9ihvl20z34z` demonstrates the featured class plus October 5 sample week. The prior owner draft remains intact. The synthetic instructor record uses Vanessa's existing public name/photo only to illustrate design; sample session dates are not production schedule changes.
- Screenshots: `leads-restyled-desktop.png`, `leads-restyled-mobile.png`, `newsletter-weekly-restyled-mobile.png`, `newsletter-featured-restyled.png` under the existing evidence directory.
- Release status: local preview only. No migration, deployment, provider email, production data change or approval/sending activation.

## Compact schedule and status colors — October 1, 2026

- Contact labels: uncontacted/not interested red; interested/converted green; unanswered/voicemail/follow-up/later yellow; spoke with customer blue; do not contact gray. Labels remain visible so color is not the only cue. The outreach editor selection changes color immediately; the saved table and existing client-page control use the same palette.
- Membership badges use actual active/former flags: active green, former/expired red, non-member yellow. No membership or outreach business rules changed.
- Weekly newsletter cards now use compact time/photo/details/Book columns like the owner screenshot, with day spacing reduced. Separate featured cards remain larger. Empty-day omission, chronological ordering, instructor portraits and event highlighting remain.
- Verified: 44 focused newsletter unit tests, typecheck, lint and diff whitespace passed. Added booking-availability coverage for the compact CTA. Browser showed distinct membership badge colors, the Interested selection turning green, desktop rows approximately 85px tall, and a 375px phone email viewport without body overflow (360px content area). These are local browser measurements, not real inbox-client results.
- No data was submitted in the color interaction check; the outreach dialog was closed without saving. No emails, deployments or production mutations. Screenshot evidence: `leads-colored-statuses.png`, `newsletter-compact-desktop.png`.

## Template introductions — October 1, 2026

Updated the weekly starter with the owner's exact two-paragraph intro (after the personalized greeting), New Class Announcement with the welcoming come-as-you-are copy, and Membership Invitation with Your time. Your rhythm. Existing class-selection, portrait/details, audience and approval behavior remains. Updated the main local design-review draft's intro without changing its compact weekly schedule. Verified the intro survived browser reload and New Class Announcement creates a fresh editable draft with the new copy. All 29 domain/template tests and formatting/diff checks passed. No deployment or email send.
