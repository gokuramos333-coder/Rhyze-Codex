# Rhyze leads and newsletters — preview work

Baseline: published source 4579b169992a17f00ed0bc1086066e45163f073d.
Scope: extend the existing Next.js/Prisma/PostgreSQL app and Resend/email job. Local preview only; no production migration, provider send, deployment or recurring automation.

Phases:
1. Add outreach, consent/suppression and newsletter revision/recipient/event records. Existing User remains the customer identity; EmailCampaign and EmailMessage remain campaign/queue records.
2. Implement audience and authoritative schedule rules, safe email rendering, templates, approval snapshots and a bounded dispatcher using the existing job/provider.
3. Integrate lead tracking with customers and a branded admin newsletter workspace, editor, history, analytics, uploads and review screens.
4. Exercise isolated PostgreSQL, captured mail, unit/integration and browser checks; deliver a working localhost preview and precise activation prerequisites.

Acceptance: authenticated staff can record idempotent outreach separately from statuses/newsletters, admins can create and persist campaigns/templates, resolve eligible deduplicated audiences, refresh correct weeks, preview, confirm captured/sandbox sends, reschedule/cancel with reapproval, preserve immutable history, and inspect explicitly sourced analytics. Non-admin access denied; unknown consent excluded; existing customer financial/membership records untouched.

Design: a table-focused workspace and editor/preview split, using existing Rhyze cream, black, coral, gold and display typography. A tile-heavy dashboard was considered but is less suited to repeated outreach and campaign editing.
