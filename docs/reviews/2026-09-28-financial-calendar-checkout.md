# Financial reporting, October schedule and card checkout

The owner requested consistent historical money reporting and exports, an October calendar import, direct card checkout without Link, safe external event-payment attribution, and an email directory.

## Reviewed behavior

- Overview, Sales, Events and CSV use the same complete ledger and Eastern date boundaries. Actual captured Stripe receipts, individual refunds and balance-transaction fees are distinct from imported, unmatched and provider-unverified records. A newer live adjustment invalidates an older verification receipt until refreshed. Missing costs are never reported as zero or called profit.
- Owner-only historical reconciliation reads bounded charge pages. Preview changes no financial records; apply is audited and never replays access, sends messages or makes provider mutations. Exact payment identifiers deduplicate sources; payer billing email cannot reassign known member ownership.
- Provider totals/currency and payment dates replace list-price or checkout-start assumptions. Instructor history is not truncated to 250 classes; earnings date boundaries use Eastern time.
- New Checkout sessions suppress Link. An occurrence-specific class price uses a server-owned, idempotent ticket purchase. It automatically books exactly that occurrence or retains an audited paid review outcome. Refunded, disputed, moved-date and review tickets cannot become generic discounted credits; settled callback replay cannot rewrite paid dates or refund status.
- Owner-only external event reconciliation verifies the actual live payment and creates the financial/booking/audit chain transactionally. It never charges or refunds a customer.
- Owner-only schedule import validates real Eastern dates, active catalog/instructors/rooms, classifications and conflicts. It inserts atomically with deterministic identities and audit records; existing occurrences are never overwritten. October's missing Mommy & Me start time and October 5 Ritmo overlap remain held for clarification.

## Verification

- Independent reviews covered financial ingestion, reporting/CSV, class checkout, external payment linking and schedule import.
- Full explicit disposable PostgreSQL run: **307 files, 1,552 tests passed; zero failures or skips**.
- TypeScript, ESLint, Prisma validation and diff whitespace checks passed.
- Offline independent live Stripe export/report parity: USD 618,615 cents collected, 14,240 refunded and 16,996 charge fees. These are not business profit or proof of complete operating expenses.
- Schedule dry run against production's read-only connection validated the 79 complete entries without writes. Two business clarifications remain pending.

Production build, publication and live read-back are separate guarded steps. This document is not a deployment receipt. No database schema migration or temporary PAT database permission is needed. Use the existing Git-hosted release process with fresh source/deployment pins.
