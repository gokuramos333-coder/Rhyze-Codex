# Rachel member-credit event — October 12, 2026

## Scope and acceptance
Owner clarified that Rachel's Soul Line Dancing should appear in Events and show the Event badge, while allowing valid class credits, VIP unlimited access, or the $15 ticket. This is a specific exception for `soul-line-dancing-rachel`; other specialty events retain their existing admission rules.

## Implementation
- Separate public event classification from the stored specialty-admission flag. The named Rachel template remains a regular-credit booking internally, preventing changes to existing credits, cancellation rules, ticket fulfillment, or historical reporting.
- Include the exception in the public Events list, event detail and shared schedule badge/color. Preserve the exact occurrence in each link. The detail page routes Rachel to the existing class-credit and occurrence-ticket flow; other events retain the event checkout route.
- Show the occurrence's actual $15 price instead of the older $25 template default, and the live 60-minute duration. The payment option is available even to active members. Do not offer the intro purchase upsell on this event.
- In member and admin booking actions, prioritize valid unlimited access, then regular class credits, before finite event credits for Rachel. Ordering does not grant entitlement: existing status, paid-through, waiver, capacity, overlap, and duplicate checks still run. Preserve VIP's monthly event credit when unlimited access is available.
- No schema or production-data migration. No changed financial transaction handlers or event-wide admission exceptions. Public Events classification is for discovery; accounting remains on existing occurrence-bound class payments to preserve historical reports. Management remains in the existing class/occurrence editor.

## Verification
- Before fix: three failing regressions demonstrated missing Rachel event classification and unwanted event-credit spending in self/admin booking.
- After fix: 304 focused unit/component/action tests passed across 65 files, zero skips.
- 10 PostgreSQL integration tests for the existing $15 occurrence ticket passed, zero skips (mocked Stripe, actual disposable database). They cover repeated/concurrent provider receipts, idempotency, partial failure rollback and unavailable capacity.
- Typecheck, lint and production build passed in a sanitized isolated source snapshot.
- Browser: public Events → Rachel detail → credit/payment choices; exact $15 price and 60 minutes; highlighted Event schedule badge; signed-in synthetic VIP booking; early VIP cancellation; signed-in finite membership booking.
- Independent local DB readback: VIP booking records VIP class access, event-credit balance stays 1, cancellation creates no additional credit account; finite membership balance 8 → 7 with a single reserve, its event credit stays 1.
- Preview uses synthetic customers on local PostgreSQL, disabled delivery and no Stripe credentials. No real payment or customer message was used as a test. Desktop screenshot retained; mobile-specific browser viewport was not exercised in this run. Shared calendar daily/weekly/monthly rendering is covered by component tests.

## Release state
Not deployed. Based on production source `32fe263b25af96a6921671950b400913bdf4cffa`, deploy `6acc4210e7e62248075409ff` verified at 2026-10-12T05:46:58Z. PAT database access OFF. Separate newsletter work is not included.

Owner's requested 60-minute/$15 October occurrence correction is already live from the preceding admin update. This source change still requires the guarded production release with fresh source/deploy pins and the full release check after deployment authorization. No claim of live end-to-end Stripe testing.

Preview: http://127.0.0.1:4341/events
Evidence: ~/Inbox/rhyze-october-event-updates-20261012/rachel-*.log and rachel-preview-*-readback.json.
